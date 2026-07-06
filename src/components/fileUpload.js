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
    <div class="upload-area" id="${containerId}-dropzone" style="position: relative;">
      <div id="${containerId}-empty-state">
        <div class="upload-icon">📁</div>
        <p class="upload-text"><span>Click to upload</span> or drag & drop</p>
        <p class="upload-text" style="font-size: 0.75rem; margin-top: 0.5rem;">${sublabel}</p>
      </div>
      
      <div id="${containerId}-success-state" class="hidden" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 100%;">
        <div style="background: rgba(16, 185, 129, 0.1); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="var(--color-accent-green, #10B981)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <img id="${containerId}-preview-img" alt="Preview" style="max-height: 120px; border-radius: 8px; object-fit: contain; display: none;" />
        <div id="${containerId}-file-icon" style="font-size: 2.5rem; display: none; color: var(--color-text-muted);">📄</div>
        <p id="${containerId}-file-name" style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary); max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">File selected</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 4px; position: relative; z-index: 5;" onclick="document.getElementById('${containerId}-input').click(); event.stopPropagation();">Change file</button>
      </div>
      
      <input type="file" accept="${accept}" id="${containerId}-input" style="display:none" />
    </div>
  `;

  const dropzone = container.querySelector(`#${containerId}-dropzone`);
  const fileInput = container.querySelector(`#${containerId}-input`);
  const emptyState = container.querySelector(`#${containerId}-empty-state`);
  const successState = container.querySelector(`#${containerId}-success-state`);
  const previewImg = container.querySelector(`#${containerId}-preview-img`);
  const fileIcon = container.querySelector(`#${containerId}-file-icon`);
  const fileName = container.querySelector(`#${containerId}-file-name`);
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

    emptyState.classList.add('hidden');
    successState.classList.remove('hidden');
    fileName.textContent = file.name;
    dropzone.style.borderColor = 'var(--color-accent-green, #10B981)';
    dropzone.style.background = 'rgba(16, 185, 129, 0.03)';

    // Show preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
        fileIcon.style.display = 'none';
      };
      reader.readAsDataURL(file);
    } else {
      previewImg.style.display = 'none';
      fileIcon.style.display = 'block';
    }

    if (onFileSelected) onFileSelected(file);
  }

  return {
    getFile: () => selectedFile,
    reset: () => {
      selectedFile = null;
      fileInput.value = '';
      emptyState.classList.remove('hidden');
      successState.classList.add('hidden');
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
      previewImg.src = '';
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
