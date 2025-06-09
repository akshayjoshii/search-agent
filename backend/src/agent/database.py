import psycopg2
from psycopg2.extras import RealDictCursor
from typing import List, Optional
from uuid import UUID, uuid4
import uuid # Added for type hinting in get_messages_by_chat_id
import datetime
import os # Added for apply_migrations
import glob # Added for apply_migrations

from src.agent.configuration import Configuration # To get POSTGRES_URI
from src.agent.schemas import ChatHistory, Message as schemas_Message # Import the Pydantic model

# TODO: Replace with a proper dependency injection mechanism if available
config = Configuration.from_runnable_config()
DATABASE_URL = config.postgres_uri

def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def create_chat(user_id: str, chat_name: Optional[str] = "New Chat") -> Optional[ChatHistory]:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            new_chat_id = uuid4()
            cur.execute(
                "INSERT INTO chat_history (user_id, chat_id, chat_name) VALUES (%s, %s, %s) RETURNING id, user_id, chat_id, chat_name, created_at, updated_at",
                (user_id, new_chat_id, chat_name)
            )
            chat_data = cur.fetchone()
            conn.commit()
            if chat_data:
                return ChatHistory(**chat_data)
    except Exception as e:
        print(f"Database error in create_chat: {e}")
        conn.rollback()
        return None
    finally:
        conn.close()
    return None


def get_chats_by_user(user_id: str) -> List[ChatHistory]:
    conn = get_db_connection()
    chats = []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, user_id, chat_id, chat_name, created_at, updated_at FROM chat_history WHERE user_id = %s ORDER BY updated_at DESC",
                (user_id,)
            )
            records = cur.fetchall()
            for record in records:
                chats.append(ChatHistory(**record))
    except Exception as e:
        print(f"Database error in get_chats_by_user: {e}")
    finally:
        conn.close()
    return chats

def get_chat_by_id(chat_id: UUID, user_id: str) -> Optional[ChatHistory]:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, user_id, chat_id, chat_name, created_at, updated_at FROM chat_history WHERE chat_id = %s AND user_id = %s",
                (chat_id, user_id)
            )
            record = cur.fetchone()
            if record:
                return ChatHistory(**record)
    except Exception as e:
        print(f"Database error in get_chat_by_id: {e}")
    finally:
        conn.close()
    return None

def update_chat_name(chat_id: UUID, user_id: str, new_name: str) -> Optional[ChatHistory]:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE chat_history SET chat_name = %s, updated_at = CURRENT_TIMESTAMP WHERE chat_id = %s AND user_id = %s RETURNING id, user_id, chat_id, chat_name, created_at, updated_at",
                (new_name, chat_id, user_id)
            )
            chat_data = cur.fetchone()
            conn.commit()
            if chat_data:
                return ChatHistory(**chat_data)
    except Exception as e:
        print(f"Database error in update_chat_name: {e}")
        conn.rollback()
        return None
    finally:
        conn.close()
    return None

def delete_chat(chat_id: UUID, user_id: str) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM chat_history WHERE chat_id = %s AND user_id = %s",
                (chat_id, user_id)
            )
            conn.commit()
            return cur.rowcount > 0
    except Exception as e:
        print(f"Database error in delete_chat: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()
    return False

def get_messages_by_chat_id(chat_id: uuid.UUID, user_id: str) -> List[schemas_Message]:
    conn = get_db_connection()
    messages: List[schemas_Message] = []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # First, get the internal chat_history.id
            cur.execute(
                "SELECT id FROM chat_history WHERE chat_id = %s AND user_id = %s",
                (str(chat_id), user_id)
            )
            chat_history_record = cur.fetchone()
            if not chat_history_record:
                return [] # Chat not found or doesn't belong to user

            chat_history_internal_id = chat_history_record['id']

            # Now fetch messages from chat_messages table
            cur.execute(
                """
                SELECT id, message_type, content, created_at, metadata
                FROM chat_messages
                WHERE chat_history_id = %s
                ORDER BY created_at ASC
                """,
                (chat_history_internal_id,)
            )
            records = cur.fetchall()
            for record in records:
                # Adapt this instantiation based on your final Message schema
                # Assuming 'type' in Pydantic schema maps to 'message_type' in DB
                msg_data = {
                    "id": str(record["id"]), # Example, if your schema has an id
                    "type": record["message_type"],
                    "content": record["content"],
                    # "created_at": record["created_at"], # if in schema
                    # "name": None, # if in schema
                    # "tool_calls": [], # if in schema
                    # "tool_call_id": None, # if in schema
                }
                # Add metadata fields if they are top-level in your Message schema
                if record["metadata"]:
                    if "name" in record["metadata"]: # Example
                        msg_data["name"] = record["metadata"]["name"]
                    if "tool_calls" in record["metadata"]: # Example
                        msg_data["tool_calls"] = record["metadata"]["tool_calls"]
                    if "tool_call_id" in record["metadata"]: # Example
                        msg_data["tool_call_id"] = record["metadata"]["tool_call_id"]

                # Ensure all required fields for schemas.Message are present
                # Example: if 'name' is not optional and not in metadata, provide a default or handle
                if "name" not in msg_data and schemas_Message.model_fields["name"].is_required() is False :
                    msg_data["name"] = None # Or some default if appropriate and not optional
                if "tool_calls" not in msg_data and schemas_Message.model_fields["tool_calls"].is_required() is False:
                     msg_data["tool_calls"] = []
                if "tool_call_id" not in msg_data and schemas_Message.model_fields["tool_call_id"].is_required() is False:
                    msg_data["tool_call_id"] = None


                messages.append(schemas_Message(**msg_data))
    except psycopg2.Error as e:
        print(f"Database error in get_messages_by_chat_id: {e}")
    except Exception as e:
        print(f"Unexpected error in get_messages_by_chat_id: {e}") # More generic catch
    finally:
        if conn: # Ensure conn is not None before closing
            conn.close()
    return messages

def apply_migrations():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Correctly locate the migrations directory relative to database.py
            # backend/src/agent/database.py -> backend/migrations/
            migrations_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'migrations')
            # Find all .sql files and sort them
            migration_files = sorted(glob.glob(os.path.join(migrations_dir, '*.sql')))

            if not migration_files:
                print("No migration files found.")
                return

            for migration_file_path in migration_files:
                print(f"Attempting to apply migration: {os.path.basename(migration_file_path)}")
                with open(migration_file_path, 'r') as f:
                    sql_script = f.read()
                # Basic check: ensure script is not empty
                if sql_script.strip():
                    cur.execute(sql_script)
                    conn.commit() # Commit after each file
                    print(f"Successfully applied migration: {os.path.basename(migration_file_path)}")
                else:
                    print(f"Skipped empty migration file: {os.path.basename(migration_file_path)}")
    except psycopg2.Error as e: # Catch psycopg2 specific errors
        print(f"Database error applying migration {os.path.basename(migration_file_path) if 'migration_file_path' in locals() else 'unknown'}: {e}")
        conn.rollback()
    except Exception as e: # Catch other errors
        print(f"Unexpected error during migrations: {e}")
        if conn: # conn might not be available if get_db_connection failed
            conn.rollback()
    finally:
        if conn:
            conn.close()
