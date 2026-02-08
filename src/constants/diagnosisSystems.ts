export const DIAGNOSIS_SYSTEMS = [
  'Genel Kontrol',
  'Dermatolojik Sistem',
  'Solunum Sistemi', 
  'Kas – İskelet Sistemi',
  'Santral Sinir Sistemi',
  'Gastrointestinal Sistem',
  'Kardiyovasküler Sistem',
  'Pisikolojik Değerlendirme',
  'Ürogental Sistem Hastalıkları',
  'Endokrin Sistem'
];

export const DIAGNOSIS_SPECIFIC_QUESTIONS: Record<string, { label: string; questions: string[] }> = {
  'Dermatolojik Sistem': {
    label: 'Dermatolojik Sistem',
    questions: [
      'Göz / Ciltte Kızarıklıklar ve Döküntü',
      'Alerji',
      'Saçlı Deride Kabuklanma',
      'Tırnaklarda Deformasyon'
    ]
  },
  'Solunum Sistemi': {
    label: 'Solunum Sistemi',
    questions: [
      'Tekrarlayan Akciğer Enfeksiyonu',
      'Ateş ve Huzursuzluk',
      'Dispne',
      'Kanlı Balgam',
      'Hırıltılı Solunum',
      'Alerjik Rinit',
      'Kronik Rinit',
      'Geniz Akıntısı',
      'Burun Akıntısı',
      'Burun Tıkanıklığı',
      'Gözlerde Sulanma / Kaşıntı',
      'Horlama',
      'Uykuda Nefes Düzensizliği (Uyku Aknesi)'
    ]
  },
  'Kas – İskelet Sistemi': {
    label: 'Kas – İskelet Sistemi',
    questions: [
      'Güçsüzlük',
      'Kas Ağrıları',
      'Eklem Ağrısı',
      'Eklem Hareket Kısıtlılığı',
      'Eklem Ödemi',
      'Eklem Şekil Bozukluğu',
      'Sabah Tutukluğu',
      'Uyuşma / Karıncalanma',
      'Kramplar'
    ]
  },
  'Santral Sinir Sistemi': {
    label: 'Santral Sinir Sistemi',
    questions: [
      'Güç Kaybı',
      'Yürüme Bozukluğu',
      'Konuşma Bozukluğu',
      'Uyuşma / Karıncalanma',
      'Kaba Motor Hareketlerinde Kısıtlılık',
      'İnce Motor Hareketlerinde Kısıtlılık',
      'Çiğneme Zorluğu',
      'Yutkunma Zorluğu',
      'Görme Kaybı',
      'İstemsiz Kasılma'
    ]
  },
  'Gastrointestinal Sistem': {
    label: 'Gastrointestinal Sistem',
    questions: [
      'Kusma',
      'İshal',
      'Konstipasyon',
      'Karın Ağrısı',
      'Disfaji (Yutkunma Güçlüğü)',
      'İştahsızlık',
      'Hematemez (Kanlı Kusma)',
      'Melana (Kanlı Dışkılama)',
      'Abdominal Distansiyon',
      'Tenesmus (İçten Gelme)'
    ]
  },
  'Kardiyovasküler Sistem': {
    label: 'Kardiyovasküler Sistem',
    questions: [
      'Göğüs Ağrısı',
      'Çarpıntı',
      'Yorgunluk',
      'Dispne (Nefes Darlığı)',
      'Ortopne',
      'Paryoksismal Nokturnal Dispne',
      'Periferik Ödem',
      'Senkop',
      'Presenkop',
      'Palpitasyon',
      'Intermittent Claudication'
    ]
  },
  'Pisikolojik Değerlendirme': {
    label: 'Pisikolojik Değerlendirme',
    questions: [
      'Depresif Ruh Hali',
      'Anksiyete',
      'İrritabilite',
      'Uyku Bozuklukları',
      'İştahsızlık',
      'Konsantrasyon Güçlüğü',
      'Sosyal Geri Çekilme',
      'Öfke Kontrolü',
      'Panik Ataklar',
      'Obsesif Kompulsif Davranışlar'
    ]
  },
  'Ürogental Sistem Hastalıkları': {
    label: 'Ürogental Sistem Hastalıkları',
    questions: [
      'Dizüri (İdrar Yaparken Yanma)',
      'Pollaküri (Sık İdrar Yapma)',
      'Ürgent İnkontinans',
      'Stres İnkontinans',
      'Nokturi',
      'Hematüri (Kanlı İdrar)',
      'Oligüri',
      'Anüri',
      'İdrar Retansiyonu',
      'Renal Kolik',
      'Genital Akıntı',
      'Genital Kaşıntı'
    ]
  },
  'Endokrin Sistem': {
    label: 'Endokrin Sistem',
    questions: [
      'Polidipsi (Çok Susama)',
      'Poliüri (Çok İdrar Yapma)',
      'Polifaji (Aşırı Açlık)',
      'Kilo Kaybı',
      'Kilo Alımı',
      'Yorgunluk',
      'İştahsızlık',
      'Termal İntolerans',
      'Sıcak / Soğuk İntoleransı',
      'Çarpıntı',
      'Tremor',
      'Depresyon',
      'Konsantrasyon Güçlüğü'
    ]
  }
};

export const DIAGNOSIS_ILLNESSES: Record<string, string[]> = {
  'Genel Kontrol': [
    'Anemi',
    'Demir Eksikliği',
    'B12 Vitamini Eksikliği',
    'D Vitamini Eksikliği',
    'Obezite',
    'Metabolik Sendrom',
    'Kronik Yorgunluk Sendromu',
    'Otoimmün Hastalıklar',
    'Enfeksiyon Hastalıkları',
    'Beslenme Bozuklukları'
  ],
  'Dermatolojik Sistem': [
    'Egzama (Atopik Dermatit)',
    'Psoriasis (Sedef Hastalığı)',
    'Ürtiker (Kurdeşen)',
    'Kontakt Dermatit',
    'Akne Vulgaris',
    'Vitiligo',
    'Fungal Enfeksiyonlar (Mantar)',
    'Rozasea',
    'Seboreik Dermatit',
    'Alopesi (Saç Dökülmesi)',
    'Selülit',
    'Herpes (Uçuk)',
    'Zona (Herpes Zoster)'
  ],
  'Solunum Sistemi': [
    'Astım',
    'KOAH (Kronik Obstrüktif Akciğer Hastalığı)',
    'Pnömoni (Zatürre)',
    'Akut Bronşit',
    'Kronik Bronşit',
    'Tüberküloz',
    'Plörezi',
    'Pulmoner Emboli',
    'Akciğer Kanseri',
    'Alerjik Rinit',
    'Sinüzit',
    'Uyku Apnesi',
    'Bronşektazi',
    'Pnömotoraks',
    'İnterstisyel Akciğer Hastalığı'
  ],
  'Kas – İskelet Sistemi': [
    'Osteoartrit',
    'Romatoid Artrit',
    'Osteoporoz',
    'Fibromiyalji',
    'Disk Hernisi (Bel Fıtığı)',
    'Servikal Disk Hernisi (Boyun Fıtığı)',
    'Skolyoz',
    'Tendinit',
    'Bursit',
    'Karpal Tünel Sendromu',
    'Gut (Damla Hastalığı)',
    'Miyalji',
    'Ankilozan Spondilit',
    'Menisküs Yırtığı',
    'Kas Distrofisi'
  ],
  'Santral Sinir Sistemi': [
    'Epilepsi',
    'Parkinson Hastalığı',
    'Multipl Skleroz (MS)',
    'Migren',
    'Alzheimer Hastalığı',
    'İnme (Felç / Serebrovasküler Olay)',
    'Periferik Nöropati',
    'Trigeminal Nevralji',
    'Bell Paralizi',
    'Beyin Tümörü',
    'Serebral Palsi',
    'Vertigo',
    'Menejit',
    'Ensefalit',
    'ALS (Amyotrofik Lateral Skleroz)'
  ],
  'Gastrointestinal Sistem': [
    'Gastrit',
    'Peptik Ülser',
    'Gastroözofageal Reflü (GÖRH)',
    'Crohn Hastalığı',
    'Ülseratif Kolit',
    'İrritabl Bağırsak Sendromu (IBS)',
    'Karaciğer Sirozu',
    'Hepatit (A, B, C)',
    'Safra Taşı (Kolelitiyazis)',
    'Pankreatit',
    'Çölyak Hastalığı',
    'Hemoroid (Basur)',
    'Apandisit',
    'Kolon Kanseri',
    'Yağlı Karaciğer Hastalığı'
  ],
  'Kardiyovasküler Sistem': [
    'Hipertansiyon (Yüksek Tansiyon)',
    'Koroner Arter Hastalığı',
    'Kalp Yetmezliği',
    'Atriyal Fibrilasyon',
    'Aritmi',
    'Miyokard Enfarktüsü (Kalp Krizi)',
    'Periferik Arter Hastalığı',
    'Derin Ven Trombozu (DVT)',
    'Kapak Hastalıkları',
    'Kardiyomiyopati',
    'Endokardit',
    'Perikardit',
    'Aort Anevrizması',
    'Hipotansiyon',
    'Varis'
  ],
  'Pisikolojik Değerlendirme': [
    'Depresyon (Major Depresif Bozukluk)',
    'Yaygın Anksiyete Bozukluğu',
    'Panik Bozukluk',
    'Sosyal Fobi',
    'Obsesif Kompulsif Bozukluk (OKB)',
    'Travma Sonrası Stres Bozukluğu (TSSB)',
    'Bipolar Bozukluk',
    'Uyku Bozuklukları (İnsomni)',
    'Yeme Bozuklukları',
    'Dikkat Eksikliği ve Hiperaktivite (DEHB)',
    'Somatoform Bozukluk',
    'Uyum Bozukluğu'
  ],
  'Ürogental Sistem Hastalıkları': [
    'İdrar Yolu Enfeksiyonu (İYE)',
    'Böbrek Taşı (Nefrolitiyazis)',
    'Kronik Böbrek Yetmezliği',
    'Akut Böbrek Yetmezliği',
    'Benign Prostat Hiperplazisi (BPH)',
    'Prostatit',
    'Mesane Kanseri',
    'Böbrek Kanseri',
    'Nefrotik Sendrom',
    'Glomerülonefrit',
    'İdrar İnkontinansı',
    'Polikistik Böbrek Hastalığı',
    'Piyelonefrit'
  ],
  'Endokrin Sistem': [
    'Tip 1 Diyabet',
    'Tip 2 Diyabet',
    'Hipotiroidi (Tiroid Bezinin Az Çalışması)',
    'Hipertiroidi (Tiroid Bezinin Fazla Çalışması)',
    'Hashimoto Tiroiditi',
    'Graves Hastalığı',
    'Cushing Sendromu',
    'Addison Hastalığı',
    'Hiperprolaktinemi',
    'Hipogonadizm',
    'Akromegali',
    'Feokromositoma',
    'Hiperparatiroidi',
    'Metabolik Sendrom',
    'İnsülin Direnci'
  ]
};
