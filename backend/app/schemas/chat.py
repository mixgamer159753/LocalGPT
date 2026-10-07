import datetime
from typing import Optional, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ImageUrlPart(BaseModel):
    url: str = Field(max_length=5000000)  # base64 image


class ContentPart(BaseModel):
    type: Literal["text", "image_url"]
    text: Optional[str] = Field(default=None, max_length=20000)
    image_url: Optional[ImageUrlPart] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: Union[str, list[ContentPart]]
    attachments: list[str] = Field(default_factory=list, max_length=4)

    @field_validator("attachments")
    @classmethod
    def valid_attachment_ids(cls, values: list[str]) -> list[str]:
        import uuid
        for value in values:
            try:
                uuid.UUID(value)
            except (ValueError, AttributeError) as exc:
                raise ValueError("invalid attachment ID") from exc
        return list(dict.fromkeys(values))

    @field_validator("content")
    @classmethod
    def content_non_empty(cls, v: Union[str, list]) -> Union[str, list]:
        if isinstance(v, str):
            if not v.strip():
                raise ValueError("content must not be empty")
        elif isinstance(v, list):
            if not v:
                raise ValueError("content list must not be empty")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    model: Optional[str] = Field(
        default=None,
        max_length=120,
        pattern=r"^[A-Za-z0-9._/-]+(?::[A-Za-z0-9._-]+)?$",
    )
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=16384)
    thinking_effort: Literal["low", "medium", "high", "max"] = "max"
    response_style: Literal["balanced", "concise", "detailed"] = "balanced"
    web_search_enabled: bool = True
    web_search_mode: Literal["auto", "always", "off"] = "auto"
    conversation_id: Optional[int] = None
    persist_user_message: bool = True

    @field_validator("messages")
    @classmethod
    def messages_non_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("messages must contain at least one message")
        if not any(message.role == "user" for message in v):
            raise ValueError("messages must contain at least one user message")
        if v[-1].role != "user":
            raise ValueError("the final message must be from the user")
        return v


class ResearchSourceOut(BaseModel):
    id: int
    title: str
    url: str
    snippet: str
    published_date: Optional[str] = None


class ResearchOut(BaseModel):
    query: str
    provider: str
    cached: bool = False
    warning: Optional[str] = None
    sources: list[ResearchSourceOut] = Field(default_factory=list)


class ChatResponse(BaseModel):
    content: str
    conversation_id: Optional[int] = None
    research: Optional[ResearchOut] = None


class FileAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    size: int
    kind: str
    chars: int
    pages: Optional[int] = None
    truncated: bool = False


class FilePreviewOut(FileAttachmentOut):
    text: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    created_at: datetime.datetime
    research: Optional[ResearchOut] = None
    attachments: Optional[list[FileAttachmentOut]] = None
    generation_warning: Optional[str] = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    model: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ConversationDetailOut(ConversationOut):
    messages: list[MessageOut] = Field(default_factory=list)


class ConversationCreate(BaseModel):
    title: Optional[str] = "New Chat"
    model: Optional[str] = Field(
        default=None,
        max_length=120,
        pattern=r"^[A-Za-z0-9._/-]+(?::[A-Za-z0-9._-]+)?$",
    )


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ModelInfo(BaseModel):
    name: str
    size: Optional[int] = None
    modified_at: Optional[str] = None
    family: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None
    context_length: Optional[int] = None
