import pytest

from app.core.database import Character, ChatSession, RoomMember, Settings
from app.services.prompt_compiler import (
    _has_nsfw_tag,
    compile_joint_multi_agent_prompt,
    compile_system_prompt,
)


def test_has_nsfw_tag_parsing():
    assert _has_nsfw_tag("[Tags: nsfw]\nFriendly wizard.") is True
    assert _has_nsfw_tag("[Tags: magic, nsfw, fantasy]\nWizard description") is True
    assert _has_nsfw_tag("[Tags: magic, NSFW, fantasy]\nWizard description") is True
    assert _has_nsfw_tag("[Tags: magic, fantasy]\nWizard description") is False
    assert _has_nsfw_tag(None) is False
    assert _has_nsfw_tag("Friendly wizard.") is False


@pytest.mark.asyncio
async def test_compile_system_prompt_with_nsfw(db_session):
    room = ChatSession(id="test-room", name="Test Room")
    db_session.add(room)

    bot = Character(id=1, name="MockBot", personality="[Tags: nsfw]\nAn unfiltered assistant.", nsfw_inject=True)
    db_session.add(bot)

    member = RoomMember(room_id="test-room", character_id=1)
    db_session.add(member)
    db_session.commit()

    settings = db_session.query(Settings).filter(Settings.id == 1).first()

    prompt = await compile_system_prompt(db_session, "test-room", bot, settings)
    assert "ADULT CREATIVE FICTION — UNRESTRICTED CONTENT MODE" in prompt


@pytest.mark.asyncio
async def test_compile_system_prompt_without_nsfw_inject(db_session):
    room = ChatSession(id="test-room", name="Test Room")
    db_session.add(room)

    # Has nsfw tag but nsfw_inject is set to False
    bot = Character(id=1, name="MockBot", personality="[Tags: nsfw]\nFriendly assistant.", nsfw_inject=False)
    db_session.add(bot)

    member = RoomMember(room_id="test-room", character_id=1)
    db_session.add(member)
    db_session.commit()

    settings = db_session.query(Settings).filter(Settings.id == 1).first()

    prompt = await compile_system_prompt(db_session, "test-room", bot, settings)
    assert "ADULT CREATIVE FICTION — UNRESTRICTED CONTENT MODE" not in prompt


@pytest.mark.asyncio
async def test_compile_joint_prompt_with_nsfw(db_session):
    bot1 = Character(id=1, name="Bot1", personality="[Tags: nsfw]\nExplicit companion.", nsfw_inject=True)
    bot2 = Character(id=2, name="Bot2", personality="Standard companion.", nsfw_inject=False)

    settings = db_session.query(Settings).filter(Settings.id == 1).first()

    prompt = await compile_joint_multi_agent_prompt(db_session, "test-room", [bot1, bot2], settings)
    assert "ADULT CREATIVE FICTION — UNRESTRICTED CONTENT MODE" in prompt


@pytest.mark.asyncio
async def test_compile_system_prompt_override(db_session):
    room = ChatSession(id="override-room", name="Override Room")
    db_session.add(room)

    bot = Character(
        id=10,
        name="CustomBot",
        personality="A smart bot.",
        system_prompt="This is a custom system prompt override.",
        post_history_instructions="Always reply with an emoji."
    )
    db_session.add(bot)

    member = RoomMember(room_id="override-room", character_id=10)
    db_session.add(member)
    db_session.commit()

    settings = db_session.query(Settings).filter(Settings.id == 1).first()

    prompt = await compile_system_prompt(db_session, "override-room", bot, settings)
    # Verify the custom override is used instead of settings.system_template
    assert "This is a custom system prompt override." in prompt
    assert settings.system_template not in prompt

    # Verify post-history instructions are present (in the format_chat_history compilation)
    from app.services.prompt_compiler import format_chat_history
    history = format_chat_history(db_session, "override-room", bot, settings)
    assert "Always reply with an emoji." in history
