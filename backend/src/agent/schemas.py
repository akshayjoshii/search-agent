from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict # Added Any, Dict
from uuid import UUID
import datetime

class ChatHistoryBase(BaseModel):
    chat_name: Optional[str] = 'New Chat'

class ChatHistoryCreate(ChatHistoryBase):
    user_id: str # Ensure this matches how user ID is stored from auth

class ChatHistoryUpdate(BaseModel):
    chat_name: Optional[str] = None

class ChatHistory(ChatHistoryBase):
    id: int
    user_id: str
    chat_id: UUID
    chat_name: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        orm_mode = True # if using an ORM like SQLAlchemy
                        # For direct psycopg2, this might not be needed / or use from_attributes = True for Pydantic v2
                        # Pydantic v1 uses orm_mode = True
                        # Pydantic v2 uses model_config = {"from_attributes": True}
                        # Assuming Pydantic v1 for now based on common FastAPI usage
                        # If using Pydantic v2, change to:
                        # model_config = {"from_attributes": True}
        from_attributes = True # Pydantic v2+

class ChatHistoryList(BaseModel):
    chats: List[ChatHistory]

class Message(BaseModel):
    id: Optional[str] = None # Or int, if you map it to chat_messages.id
    type: str # E.g., 'human', 'ai', 'system', 'tool'
    content: str
    name: Optional[str] = None # For tool messages or named AI messages
    tool_calls: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    tool_call_id: Optional[str] = None # For tool responses

    # Add created_at if you want to send it to frontend
    # created_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True # For Pydantic v2
        # orm_mode = True # For Pydantic v1

class MessageList(BaseModel):
    messages: List[Message]
