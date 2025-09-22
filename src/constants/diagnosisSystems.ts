export const DIAGNOSIS_SYSTEMS = [
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
