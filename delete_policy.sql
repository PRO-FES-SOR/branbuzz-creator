-- Add DELETE policy for Admins
CREATE POLICY "Admins can delete messages" 
  ON messages FOR DELETE 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
