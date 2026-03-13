-- Allow users to delete messages they sent
CREATE POLICY "Users can delete own sent messages"
  ON messages FOR DELETE
  USING (from_user_id = auth.uid());
