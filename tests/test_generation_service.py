import json

import pytest

from app.core.database import Character, ChatSession, Message, RoomMember
from app.services.generation_service import stream_generation


# Mock dependencies
async def mock_stream_llm_response(settings, system_prompt, history_str):
    yield "data: " + json.dumps({"text": "Hello"})
    yield "data: " + json.dumps({"text": " there!"})

async def mock_compile_system_prompt(db, room_id, target_bot, settings):
    return "Mocked System Prompt"

def mock_format_chat_history(db, room_id, target_bot, settings, exclude_from=None):
    return "Mocked Chat History"

@pytest.mark.asyncio
async def test_stream_generation_happy_path(db_session, mocker):
    # Mock services and external calls
    mocker.patch("app.services.generation_service.compile_system_prompt", mock_compile_system_prompt)
    mocker.patch("app.services.generation_service.format_chat_history", mock_format_chat_history)
    mocker.patch("app.services.generation_service.stream_llm_response", mock_stream_llm_response)
    mocker.patch("app.services.scene_service.update_hybrid_scene_state")
    mocker.patch("app.services.generation_service.run_summarizer_task")
    mocker.patch("app.services.generation_service._schedule_memory_summary")

    # Mock SessionLocal to return our test db_session and bypass close
    mocker.patch.object(db_session, "close", lambda: None)
    mocker.patch("app.services.generation_service.SessionLocal", return_value=db_session)

    # Setup mock room, character, and room member in SQLite
    room = ChatSession(id="test-room-uuid", name="Test Room", is_group=False)
    db_session.add(room)

    bot = Character(id=1, name="MockBot", greeting="Hi", personality="Friendly")
    db_session.add(bot)

    member = RoomMember(room_id="test-room-uuid", character_id=1)
    db_session.add(member)
    db_session.commit()

    # Execute generation service
    events = []
    async for chunk in stream_generation(db_session, "test-room-uuid", 1):
        events.append(chunk)

    # Assertions
    # 1. Should emit bot_start
    assert any("bot_start" in event for event in events)
    # 2. Should stream tokens
    assert any('"token": "Hello"' in event for event in events)
    assert any('"token": " there!"' in event for event in events)
    # 3. Should emit done with message ID
    assert any("done" in event for event in events)

    # Verify the message is saved in database with correct content
    msg = db_session.query(Message).filter(Message.room_id == "test-room-uuid").first()
    assert msg is not None
    assert msg.sender_type == "character"
    assert msg.content == "Hello there!"


@pytest.mark.asyncio
async def test_stream_generation_room_not_found(db_session):
    # Execute generation service with invalid room ID
    events = []
    async for chunk in stream_generation(db_session, "non-existent-room-uuid", 1):
        events.append(chunk)

    assert len(events) == 1
    assert "Room not found" in events[0]


@pytest.mark.asyncio
async def test_stream_generation_character_not_found(db_session):
    # Setup mock room in SQLite
    room = ChatSession(id="test-room-uuid", name="Test Room", is_group=False)
    db_session.add(room)
    db_session.commit()

    # Execute generation service with invalid character ID
    events = []
    async for chunk in stream_generation(db_session, "test-room-uuid", 999):
        events.append(chunk)

    assert len(events) == 1
    assert "Target character 999 not found" in events[0]
