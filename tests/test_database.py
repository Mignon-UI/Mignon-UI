from app.core.database import Character, ChatSession, RoomMember, Settings


def test_settings_default_values(db_session):
    # Retrieve default seeded settings
    settings = db_session.query(Settings).filter(Settings.id == 1).first()
    assert settings is not None
    assert settings.provider == "ollama"
    assert settings.temperature == 0.9
    assert settings.max_tokens == 2048

def test_character_creation(db_session):
    char = Character(name="Aria", greeting="Hello traveler!", personality="Kind and helpful")
    db_session.add(char)
    db_session.commit()

    retrieved = db_session.query(Character).filter(Character.name == "Aria").first()
    assert retrieved is not None
    assert retrieved.greeting == "Hello traveler!"
    assert retrieved.personality == "Kind and helpful"

def test_chat_session_with_members(db_session):
    # Create character
    char = Character(name="Jack")
    db_session.add(char)
    db_session.commit()

    # Create room
    room = ChatSession(id="room-123", name="Tavern Room", is_group=True)
    db_session.add(room)
    db_session.commit()

    # Link member
    member = RoomMember(room_id=room.id, character_id=char.id)
    db_session.add(member)
    db_session.commit()

    # Verify relationships
    assert len(room.members) == 1
    assert room.members[0].character.name == "Jack"
