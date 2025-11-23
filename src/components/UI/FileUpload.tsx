import React, { useState } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  onFileRemove: () => void;
  uploadedFileUrl?: string;
  fileName?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileUpload, 
  onFileRemove,
  uploadedFileUrl,
  fileName
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    // Reset error
    setUploadError(null);
    
    // Validate file type
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Sadece PDF, PNG, JPG veya JPEG dosyaları yüklenebilir.');
      return;
    }
    
    // Validate file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Dosya boyutu 20MB\'dan küçük olmalıdır.');
      return;
    }
    
    onFileUpload(file);
  };

  const handleRemoveFile = () => {
    onFileRemove();
    setUploadError(null);
  };

  return (
    <div 
      className={`p-6 border-2 border-dashed rounded-xl transition-all duration-200 ${
        isDragging 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-300 bg-gray-50'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {uploadedFileUrl ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-800">{fileName}</p>
              <p className="text-xs text-gray-500">Dosya yüklendi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="font-medium text-gray-700 mb-1">Dosya yükle</p>
          <p className="text-sm text-gray-500 mb-4">PDF veya resim dosyasını sürükleyin veya seçin</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <label className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
              Dosya Seç
              <input
                type="file"
                accept=".pdf,application/pdf,image/png,image/jpeg,image/jpg"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500">Maksimum 20MB</p>
          </div>
          {uploadError && (
            <p className="mt-3 text-sm text-red-500">{uploadError}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUpload;