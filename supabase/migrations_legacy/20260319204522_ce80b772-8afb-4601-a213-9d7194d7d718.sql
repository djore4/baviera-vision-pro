
-- Create storage bucket for Excel files
INSERT INTO storage.buckets (id, name, public)
VALUES ('excel-files', 'excel-files', true);

-- Allow anyone to upload files to the bucket
CREATE POLICY "Allow public upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'excel-files');

-- Allow anyone to read files from the bucket
CREATE POLICY "Allow public read" ON storage.objects
FOR SELECT USING (bucket_id = 'excel-files');

-- Allow anyone to update files in the bucket
CREATE POLICY "Allow public update" ON storage.objects
FOR UPDATE USING (bucket_id = 'excel-files');

-- Allow anyone to delete files in the bucket
CREATE POLICY "Allow public delete" ON storage.objects
FOR DELETE USING (bucket_id = 'excel-files');
