// File upload component with drag & drop — Supabase Storage
import { supabase } from '../supabase.js';
import { showError } from './toast.js';

export function createUploadArea(containerId, options = {}) {
  const {
    accept = 'image/*',
    maxSize = 10 * 1024 * 1024, // 10MB default
    onFileSelected = null,
    label = 'Drop your file here or click to browse',
    sublabel = 'Supports PNG, JPG, WEBP (max 10MB)'
  } = options;

  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = `
    <div class="upload-area" id="${containerId}-dropzone">
      <div class="upload-icon">📁</div>
      <p class="upload-text"><span>Click to upload</span> or drag & drop</p>
      <p class="upload-text" style="font-size: 0.75rem; margin-top: 0.5rem;">${sublabel}</p>
      <input type="file" accept="${accept}" id="${containerId}-input" style="display:none" />
    </div>
    <div class="upload-preview hidden" id="${containerId}-preview">
      <img id="${containerId}-preview-img" alt="Preview" />
    </div>
  `;

  const dropzone = container.querySelector(`#${containerId}-dropzone`);
  const fileInput = container.querySelector(`#${containerId}-input`);
  const previewDiv = container.querySelector(`#${containerId}-preview`);
  const previewImg = container.querySelector(`#${containerId}-preview-img`);
  let selectedFile = null;

  // Click to upload
  dropzone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
  });

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });

  function handleFile(file) {
    if (!file) return;

    if (file.size > maxSize) {
      showError(`File too large. Max size is ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    selectedFile = file;

    // Show preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewDiv.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      previewDiv.classList.add('hidden');
    }

    if (onFileSelected) onFileSelected(file);
  }

  return {
    getFile: () => selectedFile,
    reset: () => {
      selectedFile = null;
      fileInput.value = '';
      previewDiv.classList.add('hidden');
    }
  };
}

// Upload file to Supabase Storage
export async function uploadFile(file, path) {
  try {
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Supabase Storage upload error:', error);

    if (error.message?.includes('Bucket not found')) {
      throw new Error('Storage bucket "uploads" not found. Create it in Supabase Dashboard → Storage.');
    } else if (error.message?.includes('security') || error.message?.includes('policy')) {
      throw new Error('Storage permission denied. Check your storage policies in Supabase.');
    } else {
      throw new Error(`Upload failed: ${error.message || 'Unknown error'}`);
    }
  }
}
