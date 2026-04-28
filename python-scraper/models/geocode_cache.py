"""SQLAlchemy mapping for the `geocode_cache` table owned by Drizzle."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id = Column(Integer, primary_key=True)
    location = Column(Text, nullable=False, unique=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    display_name = Column(Text, nullable=True)
    not_found = Column(Integer, nullable=False, default=0)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
