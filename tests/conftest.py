import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, Settings


@pytest.fixture(scope="function")
def db_session():
    # Create an in-memory SQLite database engine for testing
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    # Session factory bound to in-memory engine
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    # Seed default Settings row (id=1)
    default_settings = Settings(
        id=1,
        provider="ollama",
        local_endpoint="http://127.0.0.1:11434/v1",
        selected_model="gemma4:e2b"
    )
    session.add(default_settings)
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
