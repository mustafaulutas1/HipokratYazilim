import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';
import { getUserPermissions } from '../../../constants/permissions';

interface DoctorNote {
  id: string;
  title: string;
  content: string;
  category: 'personal' | 'patient' | 'reminder' | 'treatment' | 'research';
  priority: 'low' | 'medium' | 'high';
  doctorId: string;
  clinicId: string;
  isPrivate: boolean;
  tags: string[];
  patientId?: string;
  patientName?: string;
  createdAt: string;
  updatedAt: string;
}

interface DoctorProfile {
  role?: string;
  userType?: string;
  permissions?: string[];
  clinicId: string;
  fullName?: string;
  email?: string;
}

interface DoctorNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorProfile: DoctorProfile | null;
}

const CATEGORY_TRANSLATIONS: Record<string, string> = {
  'personal': 'Kişisel',
  'patient': 'Hasta',
  'reminder': 'Hatırlatıcı',
  'treatment': 'Tedavi',
  'research': 'Araştırma'
};

const PRIORITY_TRANSLATIONS: Record<string, string> = {
  'low': 'Düşük',
  'medium': 'Orta',
  'high': 'Yüksek'
};

const DoctorNotesModal: React.FC<DoctorNotesModalProps> = ({ isOpen, onClose, doctorProfile }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNote, setEditingNote] = useState<DoctorNote | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'personal' as DoctorNote['category'],
    priority: 'medium' as DoctorNote['priority'],
    isPrivate: true,
    tags: '',
    patientName: ''
  });

  // Check user permissions
  const hasAccess = useCallback(() => {
    if (!user || !doctorProfile) return false;
    const userRole = doctorProfile.role || doctorProfile.userType || 'doctor';
    const permissions = getUserPermissions(userRole, doctorProfile.permissions);
    return permissions.includes('assistant-panel');
  }, [user, doctorProfile]);

  const fetchNotes = useCallback(async () => {
    if (!user || !doctorProfile) return;
    
    try {
      setLoading(true);
      console.log('🔍 Fetching doctor notes for:', user.uid);
      console.log('🏥 Clinic ID:', doctorProfile.clinicId);
      
      // First try to get all notes for this doctor and clinic without orderBy
      const notesQuery = query(
        collection(db, 'doctorNotes'),
        where('doctorId', '==', user.uid),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      
      const notesSnapshot = await getDocs(notesQuery);
      const fetchedNotes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DoctorNote));
      
      // Sort in memory by updatedAt descending
      const sortedNotes = fetchedNotes.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA; // Most recent first
      });
      
      console.log('📝 Found doctor notes:', sortedNotes.length);
      console.log('📋 Sample note:', sortedNotes[0]);
      setNotes(sortedNotes);
    } catch (error) {
      console.error('❌ Error fetching notes:', error);
      // If there's still an error, try without clinic filter
      console.log('🔄 Trying fallback query without clinic filter...');
      try {
        const fallbackQuery = query(
          collection(db, 'doctorNotes'),
          where('doctorId', '==', user.uid)
        );
        
        const fallbackSnapshot = await getDocs(fallbackQuery);
        const fallbackNotes = fallbackSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as DoctorNote));
        
        const sortedFallbackNotes = fallbackNotes.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt).getTime();
          return dateB - dateA;
        });
        
        console.log('📝 Fallback found notes:', sortedFallbackNotes.length);
        setNotes(sortedFallbackNotes);
      } catch (fallbackError) {
        console.error('❌ Fallback query also failed:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  }, [user, doctorProfile]);

  useEffect(() => {
    if (isOpen && hasAccess()) {
      fetchNotes();
    }
  }, [isOpen, hasAccess, fetchNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !doctorProfile) return;

    try {
      const noteData = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        priority: formData.priority,
        doctorId: user.uid,
        clinicId: doctorProfile.clinicId,
        isPrivate: formData.isPrivate,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
        patientName: formData.patientName.trim() || undefined,
        updatedAt: new Date().toISOString()
      };

      if (editingNote) {
        // Update existing note
        await updateDoc(doc(db, 'doctorNotes', editingNote.id), noteData);
        console.log('✅ Note updated successfully');
      } else {
        // Create new note
        await addDoc(collection(db, 'doctorNotes'), {
          ...noteData,
          createdAt: new Date().toISOString()
        });
        console.log('✅ Note created successfully');
      }

      resetForm();
      fetchNotes();
    } catch (error) {
      console.error('❌ Error saving note:', error);
    }
  };

  const handleEdit = (note: DoctorNote) => {
    setEditingNote(note);
    setFormData({
      title: note.title,
      content: note.content,
      category: note.category,
      priority: note.priority,
      isPrivate: note.isPrivate,
      tags: note.tags.join(', '),
      patientName: note.patientName || ''
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm('Bu notu silmek istediğinizden emin misiniz?')) return;
    
    try {
      await deleteDoc(doc(db, 'doctorNotes', noteId));
      console.log('✅ Note deleted successfully');
      fetchNotes();
    } catch (error) {
      console.error('❌ Error deleting note:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      category: 'personal',
      priority: 'medium',
      isPrivate: true,
      tags: '',
      patientName: ''
    });
    setEditingNote(null);
    setShowCreateForm(false);
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || note.category === selectedCategory;
    const matchesPriority = selectedPriority === 'all' || note.priority === selectedPriority;
    
    return matchesSearch && matchesCategory && matchesPriority;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-200 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30';
      case 'low': return 'bg-green-500/20 text-green-200 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-200 border-gray-500/30';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'patient': return 'bg-blue-500/20 text-blue-200 border-blue-500/30';
      case 'treatment': return 'bg-purple-500/20 text-purple-200 border-purple-500/30';
      case 'reminder': return 'bg-orange-500/20 text-orange-200 border-orange-500/30';
      case 'research': return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30';
      case 'personal': return 'bg-pink-500/20 text-pink-200 border-pink-500/30';
      default: return 'bg-gray-500/20 text-gray-200 border-gray-500/30';
    }
  };

  if (!isOpen) return null;

  // Check access before rendering
  if (!hasAccess()) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 max-w-md mx-4">
          <div className="text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h3 className="text-xl font-bold text-white mb-2">Erişim Engellendi</h3>
            <p className="text-white/70 mb-4">Bu özelliğe erişim yetkiniz bulunmuyor.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-200 transition-all duration-200"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl w-full max-w-6xl max-h-[90vh] mx-4 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📝</span>
            <div>
              <h2 className="text-2xl font-bold text-white">Doktor Notlarım</h2>
              <p className="text-white/70">Kişisel notlar ve hasta kayıtları</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-200 transition-all duration-200 flex items-center gap-2"
            >
              <span className="text-lg">➕</span>
              Yeni Not
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-all duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Notes List */}
          <div className="flex-1 flex flex-col">
            {/* Search and Filters */}
            <div className="p-6 border-b border-white/20">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <input
                    type="text"
                    placeholder="Notlarda ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="all">Tüm Kategoriler</option>
                    {Object.entries(CATEGORY_TRANSLATIONS).map(([value, label]) => (
                      <option key={value} value={value} className="bg-gray-800">{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="all">Tüm Öncelikler</option>
                    {Object.entries(PRIORITY_TRANSLATIONS).map(([value, label]) => (
                      <option key={value} value={value} className="bg-gray-800">{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Notes Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : filteredNotes.length > 0 ? (
                <div className="grid gap-4">
                  {filteredNotes.map((note) => (
                    <div key={note.id} className="bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-all duration-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-white">{note.title}</h3>
                            {note.isPrivate && (
                              <span className="text-xs bg-gray-500/30 text-gray-200 px-2 py-1 rounded-full">🔒 Özel</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs px-2 py-1 rounded-full border ${getCategoryColor(note.category)}`}>
                              {CATEGORY_TRANSLATIONS[note.category]}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(note.priority)}`}>
                              {PRIORITY_TRANSLATIONS[note.priority]}
                            </span>
                            {note.patientName && (
                              <span className="text-xs bg-blue-500/20 text-blue-200 px-2 py-1 rounded-full border border-blue-500/30">
                                👤 {note.patientName}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-4">
                          <button
                            onClick={() => handleEdit(note)}
                            className="p-1 hover:bg-blue-500/20 rounded text-blue-200 transition-all duration-200"
                            title="Düzenle"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(note.id)}
                            className="p-1 hover:bg-red-500/20 rounded text-red-200 transition-all duration-200"
                            title="Sil"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-white/80 text-sm mb-3 line-clamp-3">{note.content}</p>
                      
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {note.tags.map((tag, index) => (
                            <span key={index} className="text-xs bg-white/10 text-white/60 px-2 py-1 rounded-full">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <div className="text-xs text-white/50">
                        Oluşturuldu: {formatDate(note.createdAt)}
                        {note.updatedAt !== note.createdAt && (
                          <span> • Güncellendi: {formatDate(note.updatedAt)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-xl font-bold text-white/80 mb-2">
                    {searchTerm || selectedCategory !== 'all' || selectedPriority !== 'all' 
                      ? 'Arama Sonucu Bulunamadı' 
                      : 'Henüz Not Bulunmuyor'
                    }
                  </h3>
                  <p className="text-white/60 mb-4">
                    {searchTerm || selectedCategory !== 'all' || selectedPriority !== 'all'
                      ? 'Arama kriterlerinizi değiştirmeyi deneyin.'
                      : 'İlk notunuzu eklemek için "Yeni Not" butonuna tıklayın.'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Create/Edit Form */}
          {showCreateForm && (
            <div className="w-96 bg-white/5 border-l border-white/20 flex flex-col">
              <div className="p-4 border-b border-white/20">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    {editingNote ? 'Not Düzenle' : 'Yeni Not Ekle'}
                  </h3>
                  <button
                    onClick={resetForm}
                    className="p-1 hover:bg-white/10 rounded text-white/70 hover:text-white transition-all duration-200"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Başlık *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-blue-500/50 text-sm"
                    placeholder="Not başlığı"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">İçerik *</label>
                  <textarea
                    required
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    rows={6}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-blue-500/50 text-sm resize-none"
                    placeholder="Not içeriği..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Kategori</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value as DoctorNote['category']})}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
                    >
                      {Object.entries(CATEGORY_TRANSLATIONS).map(([value, label]) => (
                        <option key={value} value={value} className="bg-gray-800">{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Öncelik</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value as DoctorNote['priority']})}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
                    >
                      {Object.entries(PRIORITY_TRANSLATIONS).map(([value, label]) => (
                        <option key={value} value={value} className="bg-gray-800">{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Hasta Adı (Opsiyonel)</label>
                  <input
                    type="text"
                    value={formData.patientName}
                    onChange={(e) => setFormData({...formData, patientName: e.target.value})}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-blue-500/50 text-sm"
                    placeholder="Hasta adı"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Etiketler (virgülle ayırın)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({...formData, tags: e.target.value})}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-blue-500/50 text-sm"
                    placeholder="etiket1, etiket2, etiket3"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPrivate"
                    checked={formData.isPrivate}
                    onChange={(e) => setFormData({...formData, isPrivate: e.target.checked})}
                    className="w-4 h-4 text-blue-500 bg-white/10 border-white/20 rounded focus:ring-blue-500/50 focus:ring-2"
                  />
                  <label htmlFor="isPrivate" className="text-sm text-white/70">Özel not (sadece ben görebilirim)</label>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-200 transition-all duration-200 text-sm font-medium"
                  >
                    {editingNote ? 'Güncelle' : 'Kaydet'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 rounded-lg text-gray-200 transition-all duration-200 text-sm"
                  >
                    İptal
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorNotesModal;