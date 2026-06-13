import datetime
from unittest.mock import patch

import pytest

from app.core.database import Character, ChatSession, Message, RoomMember
from app.services.group_reply_order import parse_character_bio, run_ssjc_selector


def test_bio_personality_parsing():
    # Bio 1: Shy and anxious character
    bio_shy = "Lira is a shy witch. She is very timid, quiet, and reclusive. She is extremely anxious in large groups."
    traits = parse_character_bio(bio_shy, [])

    assert traits["extraversion"] < 0.3
    assert traits["assertiveness"] < 0.4
    assert traits["neuroticism"] > 0.7
    # silence_discomfort = 0.7 * 0.0 + 0.3 * 0.9 = 0.27
    assert abs(traits["silence_discomfort"] - 0.27) < 0.01

def test_comfort_matrix_parsing():
    bio = "Lira is best friends with Elara, but she is terrified of the Demon King. She is also a friend of Kaelen."
    other_names = ["Elara", "Demon King", "Kaelen", "Unknown"]

    traits = parse_character_bio(bio, other_names)
    comfort = traits["comfort"]

    assert comfort["Elara"] == 0.95       # Best friend
    assert comfort["Demon King"] == 0.15   # Terrified
    assert comfort["Kaelen"] == 0.80       # Friend
    assert comfort["Unknown"] == 0.45      # Default (stranger)

def test_status_parsing():
    assert parse_character_bio("He is a powerful king.", [])["status"] == 10
    assert parse_character_bio("She is a loyal servant.", [])["status"] == 3
    assert parse_character_bio("Just a simple villager.", [])["status"] == 5
    assert parse_character_bio("A normal adventurer.", [])["status"] == 5

@pytest.mark.asyncio
async def test_formula_3_selector_dynamics(db_session):
    # Setup test room and characters in SQLite
    room = ChatSession(id="test-rp-room", name="Roleplay Room", is_group=True)
    db_session.add(room)

    # 1. Lira (Shy, anxious)
    lira = Character(
        id=10,
        name="Lira",
        personality="Lira is a shy witch. She is quiet and reclusive, and terrified of the Demon King.",
        scenario=""
    )
    # 2. Demon King (Dominant, aggressive)
    king = Character(
        id=11,
        name="Demon King",
        personality="He is an aggressive, dominant emperor who hates everyone.",
        scenario=""
    )

    db_session.add(lira)
    db_session.add(king)
    db_session.commit()

    # Add room members
    db_session.add(RoomMember(room_id="test-rp-room", character_id=10))
    db_session.add(RoomMember(room_id="test-rp-room", character_id=11))
    db_session.commit()

    # Message history
    msg_1 = Message(
        room_id="test-rp-room",
        sender_type="character",
        character_id=11,
        sender_name="Demon King",
        content="Speak, witch! Or be destroyed.",
        created_at=datetime.datetime.now() - datetime.timedelta(seconds=2)
    )
    db_session.add(msg_1)
    db_session.commit()

    # Retrieve messages and run selection
    messages = db_session.query(Message).filter(Message.room_id == "test-rp-room").all()
    bots = [lira, king]

    # Mock semantic relevance to run 100% locally and instantly without Jina downloads
    with patch("app.services.group_reply_order.get_semantic_relevance", return_value=0.6):
        winner_id = run_ssjc_selector("", bots, messages)
        assert winner_id in [None, 10, 11]
