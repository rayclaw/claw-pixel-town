-- Migration 003: Add thumbnail support to channels
ALTER TABLE channels ADD COLUMN thumbnail TEXT;
