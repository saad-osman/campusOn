from app.services.rate_limit import reset_rate_limits


def _register(client, email="profile@example.com", password="password123"):
    return client.post(
        "/api/auth/register", json={"name": "Profile Tester", "email": email, "password": password}
    )


def test_profile_created_lazily_and_patchable(client):
    reset_rate_limits()
    _register(client, email="p1@example.com")

    res = client.get("/api/profile")
    assert res.status_code == 200
    assert res.json()["onboarding_complete"] is False

    patched = client.patch(
        "/api/profile",
        json={"degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science", "onboarding_step": 1},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["degree_level"] == "bachelors"
    assert body["year_of_study"] == 3
    assert body["onboarding_step"] == 1


def test_state_tracks_last_route_and_ui_state(client):
    reset_rate_limits()
    _register(client, email="p2@example.com")

    res = client.patch("/api/state", json={"last_route": "/discover", "ui_state": {"filters": {"field": "AI"}}})
    assert res.status_code == 200
    body = res.json()
    assert body["last_route"] == "/discover"
    assert body["ui_state"]["filters"]["field"] == "AI"


def test_state_requires_auth(client):
    client.cookies.clear()
    res = client.get("/api/state")
    assert res.status_code == 401


def test_export_my_data(client):
    reset_rate_limits()
    _register(client, email="export@example.com")
    res = client.get("/api/settings/export")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "export@example.com"
    assert "profile" in body


def test_delete_account_removes_access(client):
    reset_rate_limits()
    _register(client, email="deleteme@example.com")
    res = client.delete("/api/settings/account")
    assert res.status_code == 204

    client.cookies.clear()
    login = client.post(
        "/api/auth/login", json={"email": "deleteme@example.com", "password": "password123"}
    )
    assert login.status_code == 401
