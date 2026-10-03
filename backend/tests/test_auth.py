from app.services.rate_limit import reset_rate_limits


def _register(client, email="student@example.com", password="password123", name="Student One"):
    return client.post("/api/auth/register", json={"name": name, "email": email, "password": password})


def test_register_creates_user_and_sets_cookie(client):
    reset_rate_limits()
    res = _register(client)
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "student@example.com"
    assert body["role"] == "student"
    assert "sr_session" in res.cookies


def test_register_duplicate_email_rejected(client):
    reset_rate_limits()
    _register(client, email="dupe@example.com")
    res = _register(client, email="dupe@example.com")
    assert res.status_code == 409


def test_login_success_and_wrong_password(client):
    reset_rate_limits()
    _register(client, email="login@example.com", password="correcthorse")
    client.cookies.clear()

    bad = client.post("/api/auth/login", json={"email": "login@example.com", "password": "wrong"})
    assert bad.status_code == 401

    good = client.post("/api/auth/login", json={"email": "login@example.com", "password": "correcthorse"})
    assert good.status_code == 200
    assert "sr_session" in good.cookies


def test_login_rate_limited_after_five_attempts(client):
    reset_rate_limits()
    _register(client, email="ratelimit@example.com", password="correcthorse")
    client.cookies.clear()

    for _ in range(5):
        res = client.post(
            "/api/auth/login", json={"email": "ratelimit@example.com", "password": "wrong"}
        )
        assert res.status_code == 401

    res = client.post("/api/auth/login", json={"email": "ratelimit@example.com", "password": "wrong"})
    assert res.status_code == 429


def test_me_requires_auth(client):
    client.cookies.clear()
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_returns_current_user(client):
    reset_rate_limits()
    _register(client, email="whoami@example.com")
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["email"] == "whoami@example.com"


def test_logout_clears_session(client):
    reset_rate_limits()
    _register(client, email="logout@example.com")
    assert client.get("/api/auth/me").status_code == 200

    res = client.post("/api/auth/logout")
    assert res.status_code == 204
    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401


def test_change_password_wrong_current(client):
    reset_rate_limits()
    _register(client, email="changepw@example.com", password="original123")
    res = client.patch(
        "/api/auth/password",
        json={"current_password": "wrongwrong", "new_password": "newpassword123"},
    )
    assert res.status_code == 401


def test_change_password_success_and_relogin(client):
    reset_rate_limits()
    _register(client, email="changepw2@example.com", password="original123")
    res = client.patch(
        "/api/auth/password",
        json={"current_password": "original123", "new_password": "newpassword123"},
    )
    assert res.status_code == 200
    client.cookies.clear()

    old = client.post(
        "/api/auth/login", json={"email": "changepw2@example.com", "password": "original123"}
    )
    assert old.status_code == 401

    new = client.post(
        "/api/auth/login", json={"email": "changepw2@example.com", "password": "newpassword123"}
    )
    assert new.status_code == 200


def test_forgot_password_returns_dev_link_in_demo_mode(client):
    reset_rate_limits()
    _register(client, email="forgot@example.com")
    res = client.post("/api/auth/forgot-password", json={"email": "forgot@example.com"})
    assert res.status_code == 200
    assert "dev_token" in res.json()


def test_forgot_password_unknown_email_is_silent(client):
    reset_rate_limits()
    res = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert res.status_code == 200
    assert "dev_token" not in res.json()


def test_reset_password_with_token(client):
    reset_rate_limits()
    _register(client, email="reset@example.com", password="original123")
    forgot = client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    token = forgot.json()["dev_token"]

    res = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brandnew123"}
    )
    assert res.status_code == 200

    # token is single-use
    res2 = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "again12345"}
    )
    assert res2.status_code == 400

    client.cookies.clear()
    login = client.post(
        "/api/auth/login", json={"email": "reset@example.com", "password": "brandnew123"}
    )
    assert login.status_code == 200


def test_session_endpoint_is_200_when_logged_out(client):
    reset_rate_limits()
    client.cookies.clear()
    res = client.get("/api/auth/session")
    assert res.status_code == 200 and res.json() == {"user": None}
    _register(client, email="session@example.com")
    assert client.get("/api/auth/session").json()["user"]["email"] == "session@example.com"


def test_password_hash_fits_the_memory_budget():
    from argon2 import extract_parameters

    from app.services.security import hash_password, verify_password

    h = hash_password("correcthorse")
    params = extract_parameters(h)
    # 64 MiB per hash x parallel logins took the 512 MB host down; keep it at 19 MiB.
    assert params.memory_cost <= 19 * 1024
    assert params.parallelism == 1
    assert verify_password("correcthorse", h)
    assert not verify_password("wrong", h)


def test_login_upgrades_legacy_heavy_hash(client, db_session):
    from argon2 import PasswordHasher, extract_parameters

    from app.models.user import User

    reset_rate_limits()
    _register(client, email="legacy@example.com", password="correcthorse")
    client.cookies.clear()
    user = db_session.query(User).filter(User.email == "legacy@example.com").one()
    user.password_hash = PasswordHasher().hash("correcthorse")  # the old 64 MiB default
    db_session.commit()

    assert client.post("/api/auth/login", json={"email": "legacy@example.com", "password": "correcthorse"}).status_code == 200
    db_session.expire_all()
    upgraded = db_session.query(User).filter(User.email == "legacy@example.com").one().password_hash
    assert extract_parameters(upgraded).memory_cost <= 19 * 1024


def test_update_me_changes_name(client):
    reset_rate_limits()
    _register(client, email="rename@example.com", password="correcthorse", name="Old Name")
    r = client.patch("/api/auth/me", json={"name": "  New Name  "})
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"  # stripped
    assert client.get("/api/auth/me").json()["name"] == "New Name"


def test_update_me_validates_and_requires_login(client):
    reset_rate_limits()
    _register(client, email="rename2@example.com", password="correcthorse")
    assert client.patch("/api/auth/me", json={"name": "   "}).status_code == 422
    assert client.patch("/api/auth/me", json={"name": "x" * 81}).status_code == 422
    assert client.patch("/api/auth/me", json={"name": "x" * 80}).status_code == 200
    client.cookies.clear()
    assert client.patch("/api/auth/me", json={"name": "Nobody"}).status_code == 401
