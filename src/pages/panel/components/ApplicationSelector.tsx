import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface Application {
  id: string;
  name: string;
  description: string;
  clinicId: string;
  createdBy: string;
  createdAt: string;
}

interface ApplicationSelectorProps {
  selectedApplications: string[];
  onApplicationSelect: (application: Application) => void;
  clinicId: string;
  refreshTrigger: number;
  className?: string;
}

const ApplicationSelector: React.FC<ApplicationSelectorProps> = ({
  selectedApplications,
  onApplicationSelect,
  clinicId,
  refreshTrigger,
  className = ''
}) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!clinicId) return;

      try {
        setLoading(true);
        console.log('🔍 ApplicationSelector: Fetching all applications for clinicId:', clinicId);

        const applicationsRef = collection(db, 'medicalApplications');
        
        // Query all applications for this clinic (no diagnosis system filter)
        const q = query(
          applicationsRef,
          where('clinicId', '==', clinicId)
        );

        const querySnapshot = await getDocs(q);
        const fetchedApplications: Application[] = [];

        querySnapshot.forEach((doc) => {
          fetchedApplications.push({
            id: doc.id,
            ...doc.data()
          } as Application);
        });

        // Sort by creation date (newest first)
        fetchedApplications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        console.log('✅ ApplicationSelector: Fetched applications:', fetchedApplications.length);
        setApplications(fetchedApplications);
      } catch (error) {
        console.error('❌ ApplicationSelector: Error fetching applications:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [clinicId, refreshTrigger]);

  // Filter applications based on search
  const filteredApplications = applications.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    // Check if application is already selected by comparing names (since selectedApplications contains treatment names)
    const notAlreadySelected = !selectedApplications.includes(app.name);
    
    return matchesSearch && notAlreadySelected;
  });

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
        <span className="ml-2 text-white/70">Uygulamalar yükleniyor...</span>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-4xl mb-2">📋</div>
        <p className="text-white/70 text-sm">
          Henüz uygulama eklenmemiş.
        </p>
        <p className="text-white/50 text-xs mt-1">
          Önce Uygulama Yönetimi bölümünden uygulama ekleyin.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Search Controls */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Uygulama ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>
        
        <div className="text-white/60 text-xs">
          {filteredApplications.length} uygulama listeleniyor
        </div>
      </div>

      {/* Applications Grid */}
      {filteredApplications.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-white/60 text-sm">
            {searchTerm
              ? 'Arama kriterlerinize uygun uygulama bulunamadı.' 
              : selectedApplications.length > 0 
                ? 'Seçilebilecek uygulama kalmadı. Zaten seçilmiş uygulamalar listeden çıkarıldı.'
                : 'Henüz uygulama eklenmemiş.'}
          </p>
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto overflow-x-hidden">
          <div className="space-y-2 pr-2">
            {filteredApplications.map((application) => (
              <div
                key={application.id}
                onClick={() => onApplicationSelect(application)}
                className="p-3 bg-white/5 hover:bg-white/10 border border-white/20 hover:border-blue-500/50 rounded-lg cursor-pointer transition-all duration-200 group break-words"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-medium text-sm group-hover:text-blue-300 transition-colors truncate">
                        {application.name}
                      </h4>
                    </div>
                    
                    {application.description && (
                      <p className="text-white/60 text-xs mb-2 line-clamp-2 break-words">
                        {application.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 text-xs text-white/50 flex-wrap">
                      <span className="truncate">👨‍⚕️ {application.createdBy}</span>
                      <span>•</span>
                      <span>📅 {new Date(application.createdAt).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>
                  
                  <div className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    ➕
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplicationSelector;