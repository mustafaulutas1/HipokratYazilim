                    return (
                      <>
                        {/* Patient Info Summary */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                          <h5 className="font-medium text-blue-900 mb-2">Hasta Durumu & Tedavi Kriterleri</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-blue-700 font-medium">Yaş Grubu:</span>
                              <span className="ml-2 text-blue-900">{patient && getPatientAgeGroup(patient.birthDate)}</span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-medium">Tanı Sistemleri:</span>
                              <span className="ml-2 text-blue-900">{anamrezData?.selectedDiagnosisSystems?.length || 0}</span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-medium">Stres Değeri:</span>
                              <span className={`ml-2 font-medium ${
                                (anamrezData?.symptomRatings?.stres || 0) >= 7
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}>
                                {anamrezData?.symptomRatings?.stres || 0}/10
                              </span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-medium">Toksisite:</span>
                              <span className={`ml-2 font-medium ${
                                anamrezData?.toxicityAssessment?.hasToxicity
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}>
                                {anamrezData?.toxicityAssessment?.hasToxicity ? 'Yüksek' : 'Normal'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* All Treatment Options */}
                        <div className="space-y-6">
                          {allTreatments.map((treatment: any, index: number) => (
                            <div key={`${treatment.system}-${treatment.treatmentKey}`} className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-1">
                              <div className="bg-white rounded-lg p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                      <span className="text-green-700 text-xl">🩺</span>
                                    </div>
                                    <div>
                                      <h5 className="text-xl font-bold text-gray-900 mb-1">
                                        {treatment.name}
                                      </h5>
                                      <span className="text-sm text-blue-600 bg-blue-100 px-3 py-1 rounded-full font-medium">
                                        {treatment.system} - {index === 0 ? 'Öncelikli' : 'Alternatif'} Tedavi
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm text-gray-600">Yaş Grubu: {treatment.patientAgeGroup}</div>
                                    <div className="text-2xl font-bold text-green-600">
                                      {treatment.ageGroupData?.sessions}
                                    </div>
                                    {treatment.ageGroupData?.frequency && (
                                      <div className="text-sm text-gray-600 font-medium">📅 {treatment.ageGroupData?.frequency}</div>
                                    )}
                                  </div>
                                </div>

                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                  <p className="text-gray-800 text-sm leading-relaxed">
                                    {treatment.description}
                                  </p>
                                </div>

                                {/* Complete Treatment Timeline */}
                                <div className="mb-6">
                                  <h6 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <span className="text-blue-600">📋</span>
                                    Tedavi Protokolü - {treatment.patientAgeGroup} Yaş Grubu
                                  </h6>

                                  <div className="space-y-3">
                                    {treatment.ageGroupData?.treatmentSequence?.map((step: any, stepIndex: number) => (
                                      <div
                                        key={stepIndex}
                                        className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-200 rounded-lg"
                                      >
                                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
                                          {step.order}
                                        </div>
                                        <div className="flex-1">
                                          <div className="font-medium text-gray-900">{step.phase}</div>
                                          <div className="text-gray-600 text-sm">{step.treatment}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="font-bold text-blue-600">{step.dosage}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Treatment Selection Criteria */}
                                <div className="mb-4">
                                  <span className="text-sm font-medium text-gray-700 block mb-2">Tedavi Seçim Kriterleri:</span>
                                  <div className="flex flex-wrap gap-2">
                                    {treatment.conditions.map((condition: string, condIndex: number) => (
                                      <span
                                        key={condIndex}
                                        className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                                      >
                                        {condition}
                                      </span>
                                    ))}

                                    {treatment.toxicityRequirement && (
                                      <span className="px-3 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                                        Yüksek Toksisite Gerekli
                                      </span>
                                    )}

                                    {treatment.symptomRequirements && Object.entries(treatment.symptomRequirements).map(([symptom, required]: [string, number]) => {
                                      const patientRating = anamrezData?.symptomRatings?.[symptom] || 0;
                                      const meetsRequirement = patientRating >= required;
                                      return (
                                        <span
                                          key={symptom}
                                          className={`px-3 py-1 text-xs rounded-full ${
                                            meetsRequirement
                                              ? 'bg-green-100 text-green-800'
                                              : 'bg-yellow-100 text-yellow-800'
                                          }`}
                                        >
                                          {symptom}: {patientRating}/{required}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                                  <div className="text-sm text-gray-600">
                                    <span className="font-medium">Kontrol:</span> {treatment.control}
                                  </div>
                                  <button
                                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg"
                                    onClick={() => {
                                      setSelectedTreatment(treatment);
                                      setSelectedTreatmentOptions({ protocol: treatment.name, notes: `${treatment.system} - ${treatment.name}` });
                                      handleStartTreatment();
                                    }}
                                  >
                                    Bu Tedaviyi Seç
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );