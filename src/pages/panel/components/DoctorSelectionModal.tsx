import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, updateDoc, doc, addDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface Doctor {
  id: string;
  fullName: string;
  email: string;
  specialization: string;
  department: string;
  hospital: string;
  isAvailable?: boolean;
  hasActivePatient?: boolean;
  activePatientName?: string;
}

interface Patient {
  id: string;
  fullName: string;
  tcNo: string;
  phone: string;
  birthDate: string;
  gender: string;
  visitReason: string;
  selectedDiagnosisSystems?: string[];
}

interface DoctorSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  clinicId: string;
  onPatientAssigned?: () => void;
}

const DoctorSelectionModal: React.FC<DoctorSelectionModalProps> = ({
  isOpen,
  onClose,
  patient,
  clinicId,
  onPatientAssigned
}) => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [preferredDoctorInfo, setPreferredDoctorInfo] = useState<{ id?: string; email?: string; fullName?: string } | null>(null);

  // Compute the preferred doctor from the loaded list
  const preferredDoctor = useMemo(() => {
    if (!preferredDoctorInfo || doctors.length === 0) return null;
    return (
      doctors.find(d =>
        (preferredDoctorInfo.id && d.id === preferredDoctorInfo.id) ||
        (preferredDoctorInfo.email && d.email && d.email.toLowerCase() === preferredDoctorInfo.email.toLowerCase()) ||
        (preferredDoctorInfo.fullName && d.fullName === preferredDoctorInfo.fullName)
      ) || null
    );
  }, [doctors, preferredDoctorInfo]);

  const isPreferredDoctor = (d: Doctor) => {
    if (!preferredDoctor) return false;
    return d.id === preferredDoctor.id;
  };

  // Fetch available doctors from the same clinic (from both 'doctors' and 'clinicUsers')
  const fetchDoctors = async (): Promise<Doctor[]> => {
    if (!clinicId) return [];

    try {
      setLoading(true);

      // 1) Fetch from 'doctors' collection
      const doctorsQueryRef = query(
        collection(db, 'doctors'),
        where('clinicId', '==', clinicId)
      );
      const doctorsSnapshot = await getDocs(doctorsQueryRef);
      const doctorsData: Doctor[] = doctorsSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Doctor));

      // 2) Fetch clinic users with role 'doctor' from 'clinicUsers' collection
      const clinicUsersQueryRef = query(
        collection(db, 'clinicUsers'),
        where('clinicId', '==', clinicId),
        where('role', '==', 'doctor')
      );
      const clinicUsersSnapshot = await getDocs(clinicUsersQueryRef);
      const clinicUserDoctors: Doctor[] = clinicUsersSnapshot.docs.map(d => ({
        id: d.id,
        fullName: (d.data() as any).fullName,
        email: (d.data() as any).email,
        specialization: (d.data() as any).specialization || (d.data() as any).department || 'Genel',
        department: (d.data() as any).department || '',
        hospital: (d.data() as any).hospital || '',
        isAvailable: true
      }));

      // 2b) Also try userType === 'doctor' as a fallback
      const clinicUsersAltQueryRef = query(
        collection(db, 'clinicUsers'),
        where('clinicId', '==', clinicId),
        where('userType', '==', 'doctor')
      );
      const clinicUsersAltSnapshot = await getDocs(clinicUsersAltQueryRef);
      const clinicUserDoctorsAlt: Doctor[] = clinicUsersAltSnapshot.docs.map(d => ({
        id: d.id,
        fullName: (d.data() as any).fullName,
        email: (d.data() as any).email,
        specialization: (d.data() as any).specialization || (d.data() as any).department || 'Genel',
        department: (d.data() as any).department || '',
        hospital: (d.data() as any).hospital || '',
        isAvailable: true
      }));

      // Merge all sources
      const combined = [...doctorsData, ...clinicUserDoctors, ...clinicUserDoctorsAlt];

      // De-duplicate by email if available, otherwise by fullName + specialization
      const uniqueMap = new Map<string, Doctor>();
      for (const docItem of combined) {
        const key = (docItem.email?.toLowerCase?.() || `${docItem.fullName}|${docItem.specialization}`).trim();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, docItem);
        }
      }
      const uniqueDoctors = Array.from(uniqueMap.values());

      // Sort doctors by specialization and then name
      uniqueDoctors.sort((a, b) => {
        const specA = a.specialization || '';
        const specB = b.specialization || '';
        if (specA !== specB) {
          return specA.localeCompare(specB);
        }
        return a.fullName.localeCompare(b.fullName);
      });

      // Check availability for each doctor
      const doctorsWithAvailability = await Promise.all(
        uniqueDoctors.map(async (doctor) => {
          try {
            const activePatientQuery = query(
              collection(db, 'patients'),
              where('assignedDoctorId', '==', doctor.id),
              where('status', 'in', ['assigned_to_doctor', 'in_treatment'])
            );
            
            const activePatientSnapshot = await getDocs(activePatientQuery);
            const hasActivePatient = activePatientSnapshot.docs.length > 0;
            const activePatientName = hasActivePatient ? 
              activePatientSnapshot.docs[0].data().fullName : undefined;
            
            return {
              ...doctor,
              hasActivePatient,
              activePatientName
            };
          } catch (error) {
            console.error(`Error checking availability for doctor ${doctor.id}:`, error);
            return {
              ...doctor,
              hasActivePatient: false
            };
          }
        })
      );

      setDoctors(doctorsWithAvailability);
      return doctorsWithAvailability;
    } catch (error) {
      console.error('Error fetching doctors:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      if (!isOpen || !clinicId || !patient?.id) return;

      // 1) Fetch latest anamrez record for this patient to detect preferred doctor
      let currentPref: { id?: string; email?: string; fullName?: string } | null = null;
      try {
        const anamnezQueryRef = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patient.id)
        );
        const anamnezSnapshot = await getDocs(anamnezQueryRef);
        const records = anamnezSnapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        // pick latest by updatedAt or createdAt
        records.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
        const latest = records[0];
        if (latest?.selectedDoctorId || latest?.selectedDoctor) {
          const fullNameStr = (latest.selectedDoctor?.name as string) || (latest.selectedDoctor?.fullName as string) || undefined;
          currentPref = {
            id: latest.selectedDoctorId as string | undefined,
            email: (latest.selectedDoctor?.email as string) || undefined,
            fullName: fullNameStr
          };
        }
        setPreferredDoctorInfo(currentPref);
      } catch (e) {
        console.warn('Could not resolve preferred doctor from anamrez record:', e);
        setPreferredDoctorInfo(null);
      }

      // 2) Fetch doctors list and then auto-select if preferred exists
      const loadedDoctors = await fetchDoctors();

      // after doctors are loaded, try to select preferred
      if (loadedDoctors && loadedDoctors.length > 0) {
        // Prefer local preferred info (fresh), fallback to state if any
        const prefToUse = currentPref ?? preferredDoctorInfo ?? null;
        if (prefToUse) {
          const match = loadedDoctors.find(d =>
            (prefToUse.id && d.id === prefToUse.id) ||
            (prefToUse.email && d.email && d.email.toLowerCase() === prefToUse.email.toLowerCase()) ||
            (prefToUse.fullName && d.fullName === prefToUse.fullName)
          ) || null;
          if (match) setSelectedDoctor(match);
        }
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, clinicId, patient?.id]);

  const handleAssignPatient = async () => {
    if (!selectedDoctor || !patient) return;

    try {
      setAssigning(true);

      // Check if the doctor already has an active patient
      const activePatientQuery = query(
        collection(db, 'patients'),
        where('assignedDoctorId', '==', selectedDoctor.id),
        where('status', 'in', ['assigned_to_doctor', 'in_treatment'])
      );
      
      const activePatientSnapshot = await getDocs(activePatientQuery);
      
      if (activePatientSnapshot.docs.length > 0) {
        alert(`Dr. ${selectedDoctor.fullName} şu anda aktif bir hastası var. Lütfen başka bir doktor seçin.`);
        setAssigning(false);
        return;
      }

      // Update patient record with assigned doctor
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        assignedDoctorId: selectedDoctor.id,
        assignedDoctorName: selectedDoctor.fullName,
        assignedAt: new Date().toISOString(),
        status: 'assigned_to_doctor',
        updatedAt: new Date().toISOString()
      });

      // Create a notification/assignment record
      await addDoc(collection(db, 'patientAssignments'), {
        patientId: patient.id,
        patientName: patient.fullName,
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.fullName,
        clinicId: clinicId,
        assignedAt: new Date().toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      console.log(`✅ Patient ${patient.fullName} assigned to Dr. ${selectedDoctor.fullName}`);
      
      // Call callback to refresh patient list
      if (onPatientAssigned) {
        onPatientAssigned();
      }

      // Close modal
      onClose();
      setSelectedDoctor(null);

    } catch (error) {
      console.error('Error assigning patient to doctor:', error);
      alert('Hasta doktora gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setAssigning(false);
    }
  };

  const handleClose = () => {
    setSelectedDoctor(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Doktor Seçimi</h2>
              <p className="text-white/80 text-sm">
                {patient?.fullName} için doktor seçin
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Patient Info */}
        {patient && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-lg">👤</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{patient.fullName}</h3>
                <p className="text-sm text-gray-600">
                  {patient.visitReason} • Tel: {patient.phone}
                </p>
                {patient.selectedDiagnosisSystems && patient.selectedDiagnosisSystems.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.selectedDiagnosisSystems.map((system, index) => (
                      <span 
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {system}
                      </span>
                    ))}
                  </div>
                )}
                {preferredDoctor && (
                  <div className="mt-2 text-xs text-blue-700 bg-blue-100 border border-blue-200 rounded-md px-2 py-1 inline-flex items-center gap-2">
                    <span>⭐</span>
                    <span>
                      Anamnezde tercih edilen doktor: <strong>Dr. {preferredDoctor.fullName}</strong> (isteğe bağlı değiştirilebilir)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Doctors List */}
        <div className="p-6 max-h-96 overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Mevcut Doktorlar ({doctors.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : doctors.length > 0 ? (
            <div className="space-y-3">
              {doctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                    selectedDoctor?.id === doctor.id
                      ? 'border-blue-500 bg-blue-50'
                      : doctor.hasActivePatient
                      ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                  onClick={() => !doctor.hasActivePatient && setSelectedDoctor(doctor)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      doctor.hasActivePatient 
                        ? 'bg-gradient-to-br from-gray-400 to-gray-500'
                        : 'bg-gradient-to-br from-green-500 to-emerald-500'
                    }`}>
                      <span className="text-white text-lg">👨‍⚕️</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className={`font-semibold ${doctor.hasActivePatient ? 'text-gray-500' : 'text-gray-800'}`}>
                          Dr. {doctor.fullName}
                        </h4>
                        {isPreferredDoctor(doctor) && !doctor.hasActivePatient && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                            Tercih edilen doktor
                          </span>
                        )}
                        {selectedDoctor?.id === doctor.id && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                      <p className={`text-sm ${doctor.hasActivePatient ? 'text-gray-400' : 'text-gray-600'}`}>
                        {doctor.specialization}
                      </p>
                      <p className={`text-xs ${doctor.hasActivePatient ? 'text-gray-400' : 'text-gray-500'}`}>
                        {doctor.department} • {doctor.hospital}
                      </p>
                      {doctor.hasActivePatient && doctor.activePatientName && (
                        <p className="text-xs text-red-600 mt-1">
                          Aktif hasta: {doctor.activePatientName}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {doctor.hasActivePatient ? (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                          Meşgul
                        </span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          Müsait
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">👨‍⚕️</div>
              <h4 className="text-gray-600 text-lg font-semibold mb-2">Doktor Bulunamadı</h4>
              <p className="text-gray-500">Bu klinikde kayıtlı doktor bulunmuyor.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {selectedDoctor ? (
                <span className="text-blue-600 font-medium">
                  Dr. {selectedDoctor.fullName} seçildi {preferredDoctor && selectedDoctor.id === preferredDoctor.id && (
                    <span className="ml-2 text-xs text-yellow-700 bg-yellow-100 border border-yellow-200 rounded px-2 py-0.5">(Tercih edilen)</span>
                  )}
                </span>
              ) : (
                'Lütfen bir doktor seçin'
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAssignPatient}
                disabled={!selectedDoctor || assigning || selectedDoctor?.hasActivePatient}
                className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${
                  !selectedDoctor || assigning || selectedDoctor?.hasActivePatient
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {assigning ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Gönderiliyor...
                  </>
                ) : (
                  <>
                    <span>📤</span>
                    Doktora Gönder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorSelectionModal;
