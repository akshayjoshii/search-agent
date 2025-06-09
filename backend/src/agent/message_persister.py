import psycopg2
from psycopg2.extras import RealDictCursor, Json
import uuid # Ensure this is imported
from typing import Optional, Dict

# Assuming Configuration is in src.agent.configuration
# Adjust the import path if Configuration is located elsewhere
from src.agent.configuration import Configuration

# TODO: Replace with a proper dependency injection mechanism if available
config = Configuration.from_runnable_config()
DATABASE_URL = config.postgres_uri

def get_persister_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def add_message_to_db(
    chat_id_uuid: uuid.UUID,
    message_type: str,
    content: str,
    metadata: Optional[Dict] = None
) -> bool:
    conn = get_persister_db_connection()
    try:
        with conn.cursor() as cur: # No RealDictCursor needed for these specific operations
            # Get the internal chat_history.id (integer PK)
            cur.execute(
                "SELECT id FROM chat_history WHERE chat_id = %s",
                (str(chat_id_uuid),)
            )
            chat_history_record = cur.fetchone()

            if not chat_history_record:
                print(f"Error in add_message_to_db: Chat history record not found for chat_id {chat_id_uuid}")
                return False

            chat_history_internal_id = chat_history_record[0] # id is the first column

            cur.execute(
                """
                INSERT INTO chat_messages (chat_history_id, message_type, content, metadata)
                VALUES (%s, %s, %s, %s)
                """,
                (chat_history_internal_id, message_type, content, Json(metadata) if metadata else None)
            )
            conn.commit()
            # print(f"Message persisted: chat_id={chat_id_uuid}, type={message_type}") # Optional: for debugging
            return True
    except psycopg2.Error as e:
        print(f"Database error in add_message_to_db for chat_id {chat_id_uuid}: {e}")
        conn.rollback()
        return False
    except Exception as e:
        print(f"Unexpected error in add_message_to_db for chat_id {chat_id_uuid}: {e}")
        conn.rollback() # Rollback on any exception
        return False
    finally:
        if conn: # Ensure conn was successfully initialized before trying to close
            conn.close()
    return False
