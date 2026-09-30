from app.services.rate_limit import reset_rate_limits


def _register(client, email, name="User"):
    return client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})


def _login(client, email):
    client.cookies.clear()
    return client.post("/api/auth/login", json={"email": email, "password": "password123"})


def test_create_workspace_with_template_creates_docs(client):
    reset_rate_limits()
    _register(client, "owner1@example.com")
    res = client.post(
        "/api/workspaces",
        json={"name": "Summer 2027 Internships", "template": "single_application"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["my_role"] == "owner"
    assert body["document_count"] == 3

    docs = client.get(f"/api/workspaces/{body['id']}/documents").json()
    types = sorted(d["type"] for d in docs)
    assert types == ["checklist", "cold_email", "sop"]


def test_blank_template_has_no_docs(client):
    reset_rate_limits()
    _register(client, "owner2@example.com")
    res = client.post("/api/workspaces", json={"name": "Blank File", "template": "blank"})
    assert res.json()["document_count"] == 0


def test_list_workspaces_only_shows_mine(client):
    reset_rate_limits()
    _register(client, "isolated_owner@example.com")
    client.post("/api/workspaces", json={"name": "Mine", "template": "blank"})

    _register(client, "other_owner@example.com")
    res = client.get("/api/workspaces")
    names = [w["name"] for w in res.json()]
    assert "Mine" not in names


def test_non_member_gets_404_not_403(client):
    reset_rate_limits()
    _register(client, "priv_owner@example.com")
    ws = client.post("/api/workspaces", json={"name": "Private", "template": "blank"}).json()

    _register(client, "outsider@example.com")
    res = client.get(f"/api/workspaces/{ws['id']}")
    assert res.status_code == 404  # existence not leaked to non-members


def test_viewer_cannot_edit_document(client):
    reset_rate_limits()
    _register(client, "fileowner@example.com")
    ws = client.post("/api/workspaces", json={"name": "Team File", "template": "blank"}).json()
    doc = client.post(
        f"/api/workspaces/{ws['id']}/documents", json={"type": "notes", "title": "Notes"}
    ).json()
    invite = client.post(
        f"/api/workspaces/{ws['id']}/invites", json={"email": "vieweruser@example.com", "role": "viewer"}
    ).json()

    _register(client, "vieweruser@example.com")
    accept = client.post(f"/api/invites/{invite['token']}/accept")
    assert accept.status_code == 200
    assert accept.json()["role"] == "viewer"

    res = client.patch(
        f"/api/documents/{doc['id']}", json={"content": "trying to edit", "base_version": doc["version"]}
    )
    assert res.status_code == 403


def test_editor_can_edit_document_owner_can_delete_workspace(client):
    reset_rate_limits()
    _register(client, "fileowner2@example.com")
    ws = client.post("/api/workspaces", json={"name": "Team File 2", "template": "blank"}).json()
    doc = client.post(
        f"/api/workspaces/{ws['id']}/documents", json={"type": "notes", "title": "Notes"}
    ).json()
    invite = client.post(
        f"/api/workspaces/{ws['id']}/invites", json={"email": "editoruser@example.com", "role": "editor"}
    ).json()

    _register(client, "editoruser@example.com")
    client.post(f"/api/invites/{invite['token']}/accept")
    res = client.patch(
        f"/api/documents/{doc['id']}", json={"content": "editor wrote this", "base_version": doc["version"]}
    )
    assert res.status_code == 200
    assert res.json()["content"] == "editor wrote this"
    assert res.json()["version"] == doc["version"] + 1

    # editor cannot delete the workspace (owner-only per Section 4.3)
    del_res = client.delete(f"/api/workspaces/{ws['id']}")
    assert del_res.status_code == 403

    _login(client, "fileowner2@example.com")
    del_res2 = client.delete(f"/api/workspaces/{ws['id']}")
    assert del_res2.status_code == 204


def test_document_optimistic_concurrency_conflict(client):
    reset_rate_limits()
    _register(client, "concurrency@example.com")
    ws = client.post("/api/workspaces", json={"name": "Concurrency", "template": "blank"}).json()
    doc = client.post(
        f"/api/workspaces/{ws['id']}/documents", json={"type": "notes", "title": "Notes"}
    ).json()

    ok = client.patch(f"/api/documents/{doc['id']}", json={"content": "first edit", "base_version": doc["version"]})
    assert ok.status_code == 200

    # Simulate a stale client still holding the old base_version
    stale = client.patch(f"/api/documents/{doc['id']}", json={"content": "stale edit", "base_version": doc["version"]})
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["content"] == "first edit"


def test_document_version_history_and_restore(client):
    reset_rate_limits()
    _register(client, "versions@example.com")
    ws = client.post("/api/workspaces", json={"name": "Versions", "template": "blank"}).json()
    doc = client.post(
        f"/api/workspaces/{ws['id']}/documents", json={"type": "notes", "title": "Notes"}
    ).json()

    v1 = client.patch(f"/api/documents/{doc['id']}", json={"content": "v1 content", "base_version": doc["version"]}).json()
    client.patch(f"/api/documents/{doc['id']}", json={"content": "v2 content", "base_version": v1["version"]})

    history = client.get(f"/api/documents/{doc['id']}/versions").json()
    assert len(history) == 2  # snapshots of v(original empty) and v1

    restore = client.post(f"/api/documents/{doc['id']}/versions/{doc['version']}/restore")
    assert restore.status_code == 200
    assert restore.json()["content"] == ""  # restored the original empty snapshot


def test_invite_expired_rejected(client):
    from datetime import datetime, timedelta, timezone

    reset_rate_limits()
    _register(client, "expireowner@example.com")
    ws = client.post("/api/workspaces", json={"name": "Expiry", "template": "blank"}).json()
    invite = client.post(
        f"/api/workspaces/{ws['id']}/invites", json={"email": "latecomer@example.com", "role": "editor"}
    ).json()

    # Manually expire it via the DB to avoid waiting 7 days in a test
    from app.db import SessionLocal
    from app.models.workspace import Invite

    db = SessionLocal()
    row = db.query(Invite).filter(Invite.token == invite["token"]).first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()
    db.close()

    _register(client, "latecomer@example.com")
    res = client.post(f"/api/invites/{invite['token']}/accept")
    assert res.status_code == 400


def test_invite_single_use(client):
    reset_rate_limits()
    _register(client, "singleuseowner@example.com")
    ws = client.post("/api/workspaces", json={"name": "SingleUse", "template": "blank"}).json()
    invite = client.post(
        f"/api/workspaces/{ws['id']}/invites", json={"email": "onceuser@example.com", "role": "editor"}
    ).json()

    _register(client, "onceuser@example.com")
    first = client.post(f"/api/invites/{invite['token']}/accept")
    assert first.status_code == 200
    second = client.post(f"/api/invites/{invite['token']}/accept")
    assert second.status_code == 400


def test_activity_log_records_events(client):
    reset_rate_limits()
    _register(client, "activityowner@example.com")
    ws = client.post("/api/workspaces", json={"name": "Activity", "template": "blank"}).json()
    client.post(f"/api/workspaces/{ws['id']}/documents", json={"type": "notes", "title": "Notes"})

    log = client.get(f"/api/workspaces/{ws['id']}/activity").json()
    actions = [a["action"] for a in log]
    assert "workspace_created" in actions
    assert "document_created" in actions


def test_cannot_remove_last_owner(client):
    reset_rate_limits()
    _register(client, "lastowner@example.com")
    ws = client.post("/api/workspaces", json={"name": "LastOwner", "template": "blank"}).json()
    members = client.get(f"/api/workspaces/{ws['id']}/members").json()
    owner_member = members[0]

    res = client.delete(f"/api/workspaces/{ws['id']}/members/{owner_member['id']}")
    assert res.status_code == 400
