import 'database_helper.dart';
import '../models/checklist_template_item.dart';

Future<void> seedTemplateIfEmpty() async {
  final db = DatabaseHelper.instance;
  final existing = db.getTemplate(type: 'UAP');
  if (existing.isNotEmpty) return;

  final uapItems = <Map<String, String>>[
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Ask Students to wait outside the room',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Make sure Total PC Available >= Students Attending Onsite',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': '[ONLINE] Form Answer Backup',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': '[ONLINE] Start record before opening the question case',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Show MANDATORY information (Time XX-XX, Zip Format, etc)',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Display Seat (Messier > Job > Assignment Proctor)',
    },
    {'section': 'Technical', 'label': 'Relogin Messier'},
    {'section': 'Technical', 'label': 'Login Zoom and Rename'},
    {'section': 'Technical', 'label': 'Make sure Zoom Recording is Started'},
    {
      'section': 'Technical',
      'label':
          '[OPTIONAL] Turn on TV > HDMI 1 > Duplicate (Screen Settings) > Make sure both TV and Monitor are the same screen',
    },
    {
      'section': 'Technical',
      'label': 'Make sure Speaker and Microphone is Functional',
    },
    {'section': 'RUMAN', 'label': 'Clear All Drive'},
    {'section': 'RUMAN', 'label': 'Clear FTP'},
    {'section': 'RUMAN', 'label': 'Open Drive D'},
    {'section': 'RUMAN', 'label': 'Open apps needed (including lab slc)'},
    {'section': 'RUMAN', 'label': 'Lock USB'},
    {'section': 'RUMAN', 'label': 'Clear VSCode Cache'},
    {'section': 'Students', 'label': 'Wifi Attendance'},
    {'section': 'Students', 'label': 'All belongings on Podium'},
    {'section': 'Students', 'label': 'Download Question Case'},
    {'section': 'While Ongoing', 'label': 'Remind to keep Saving the files'},
    {
      'section': 'While Ongoing',
      'label': 'Zip before submission (close files before zipping)',
    },
    {'section': 'While Ongoing', 'label': r'Make sure saving at Drive D:\'},
    {'section': 'Submission', 'label': 'Close all apps before Zipping'},
    {'section': 'Submission', 'label': 'Backup Answers to FTP'},
    {'section': 'Submission', 'label': 'Make sure all students submitted'},
    {'section': 'After Submission', 'label': 'NETFILE [EXTREMELY MANDATORY]'},
    {
      'section': 'After Submission',
      'label': 'Backup to FS-USER [EXTREMELY MANDATORY]',
    },
    {'section': 'After Submission', 'label': 'Attendance Log and Session Log'},
    {'section': 'After Submission', 'label': 'Restart All PC'},
    {'section': 'After Submission', 'label': 'Clear Drive D'},
    {'section': 'After Submission', 'label': 'Clear FTP'},
    {'section': 'After Submission', 'label': 'Open Drive'},
    {'section': 'After Submission', 'label': 'Verify Messier'},
    {'section': 'After Submission', 'label': 'Manual Upload (special cases)'},
  ];

  final uasItems = <Map<String, String>>[
    // FASE 0
    {
      'section': 'Fase 0 — Sebelum Hari Mengawas',
      'label': 'Cek jadwal mengawas di acadservices.apps.binus.ac.id',
    },
    {
      'section': 'Fase 0 — Sebelum Hari Mengawas',
      'label': 'Cek juga via bit.ly/uasproctoreven2526',
    },
    {
      'section': 'Fase 0 — Sebelum Hari Mengawas',
      'label':
          'Pastikan shift normal (bukan sebelum jam 8 pagi atau setelah jam 5 sore)',
    },
    {
      'section': 'Fase 0 — Sebelum Hari Mengawas',
      'label': 'Kalau jadwal bentrok, lapor ke QMan dengan format yang benar',
    },

    // FASE 1
    {
      'section': 'Fase 1 — Kedatangan & Persiapan Ruangan (H-40 menit)',
      'label': 'Hadir di ruang 200 minimal 40 menit sebelum jadwal mengawas',
    },
    {
      'section': 'Fase 1 — Kedatangan & Persiapan Ruangan (H-40 menit)',
      'label': 'Absen di 200',
    },
    {
      'section': 'Fase 1 — Kedatangan & Persiapan Ruangan (H-40 menit)',
      'label': 'Ambil berkas ujian (jika ada)',
    },
    {
      'section': 'Fase 1 — Kedatangan & Persiapan Ruangan (H-40 menit)',
      'label': 'Pinjam ruangan ujian',
    },
    {
      'section': 'Fase 1 — Kedatangan & Persiapan Ruangan (H-40 menit)',
      'label': 'Siapkan ruangan, PC, dan proyektor',
    },
    {
      'section': 'Fase 1 — Kedatangan & Persiapan Ruangan (H-40 menit)',
      'label': 'Download Manual via TheoryExam',
    },

    // FASE 2
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': '25 menit sebelum ujian: lakukan Ruman jika ada soal softcopy',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Restart PC',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Lock USB',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Clear FTP',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Clear Drive D',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Open Drive',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Clear VSCode Cache',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Lock Keyboard & Mouse',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Buka aplikasi ujian',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Ruman: Buka Exam Warning',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Cek Lab SLC',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Jalankan Language Changer jika matkul berbahasa tertentu',
    },
    {
      'section': 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      'label': 'Login pakai NIM + Binusmaya',
    },

    // FASE 3
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Pastikan hanya mahasiswa eligible yang masuk',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Tunggu Exam Pass Eligibility status hijau',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Jika merah karena KEU → mahasiswa tidak boleh masuk',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Cek ulang Nama, NIM, tanggal, dan jam ujian sesuai jadwal',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label':
          'Pelanggaran ringan: beri peringatan, foto bukti, foto NIM+Nama, kirim ke grup WA Pengawas',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Sandal karena cedera → boleh, wajib dicatat di Berita Acara',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Tas tidak dibawa masuk → titip di meja pengawas / loker',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Ponsel wajib dimatikan, tidak boleh ada di meja',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Tipeks cair, label, Meta Glasses → dilarang',
    },
    {
      'section': 'Fase 3 — Penerimaan Peserta Ujian',
      'label': 'Kalkulator scientific → cek ketentuan sesuai matkul',
    },

    // FASE 4
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label':
          'Telat di menit ke-20 tanpa flazz → tetap boleh ke LSC tanpa flazz',
    },
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label':
          'Telat >= 20 menit → skorsing 25 menit, lapor ke grup dengan format yang benar',
    },
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label':
          'Telat >30 menit tanpa surat → tidak boleh ikut kecuali didampingi staff LSC',
    },
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label': 'Ada Form Permohonan Cetak Binus Flazz → konfirmasi ke LSC dulu',
    },
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label':
          'Telat >30 menit → centang Present di Bimay Pengawas + Violation Late + jam kedatangan',
    },
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label':
          'Tidak hadir → uncheck presensi, catat di Exam Notes: NIM (Tidak Hadir)',
    },
    {
      'section': 'Fase 4 — Keterlambatan & Dokumen Ketinggalan',
      'label': 'Setelah 30 menit → absen ulang, pastikan posisi seat sesuai',
    },

    // FASE 5
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Setelah Himbauan Rektor diputar → bacakan Quiz Card',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Quiz Card: ingatkan waktu pengerjaan dan pengumpulan',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Quiz Card: duduk sesuai seat, semua barang di depan',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Quiz Card: tidak boleh buka aplikasi yang tidak diizinkan',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Quiz Card: request FTP tidak diperbolehkan',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Quiz Card: kendala teknis → angkat tangan',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Quiz Card: Notepad ujian tersedia di grup (Line & FS)',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label': 'Buka segel soal di depan pengawas',
    },
    {
      'section': 'Fase 5 — Pembukaan Ujian',
      'label':
          'Ambil soal via TheoryExam: Baca → Unzip → Masukkan ke Drive D → Save mandiri',
    },

    // FASE 6
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Jika Berkas Ujian dan NA sama tapi Dosen beda → ikuti Berkas Ujian',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Jika Berkas Ujian beda dengan NA → konfirmasi dulu ke QMan',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Kendala teknis PC: coba basic troubleshooting dulu',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Dilarang menyentuh mouse/keyboard mahasiswa, hanya boleh memberi arahan',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Perpindahan tempat duduk → catat di Exam Notes dan TheoryExam',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Catat waktu freeze dan waktu solve',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Tidak bisa login → bypass login, cocokkan wajah dengan foto di sistem',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Perpanjangan waktu → konfirmasi ke QMan dulu, input di TheoryExam',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Perpanjangan >10 menit → info juga ke grup WA',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Indikasi kecurangan: ambil/foto bukti TERLEBIH DAHULU, lapor ke QMan',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Jika QMan approve → kabari grup LSC, tulis di Bimay Pengawas',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Mahasiswa tetap lanjut mengerjakan ujian, barang bukti diamankan',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Lirik-lirik → pindahkan tempat duduk + peringatan; masih mengulang → Violation',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Soal ambigu → tanyakan ke QMan, jangan diputuskan sendiri',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Sebelum finalize & FTP → pastikan semua mahasiswa duduk di tempat masing-masing',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label': 'Mahasiswa selesai & submit → langsung arahkan keluar ruangan',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Ujian >180 menit & ke toilet → harus didampingi pengawas, pastikan tidak bawa contekan',
    },
    {
      'section': 'Fase 6 — Selama Ujian Berlangsung',
      'label':
          'Jawaban gagal submit → uncheck status submit, catat sebagai Violation',
    },

    // FASE 7
    {
      'section': 'Fase 7 — Menjelang Berakhirnya Ujian',
      'label':
          'Ingatkan mahasiswa yang sudah submit untuk download ulang & cek hasil',
    },
    {
      'section': 'Fase 7 — Menjelang Berakhirnya Ujian',
      'label': 'Cek FTP per NIM',
    },
    {
      'section': 'Fase 7 — Menjelang Berakhirnya Ujian',
      'label': 'Panggil mahasiswa yang belum mengumpulkan via TheoryExam',
    },
    {
      'section': 'Fase 7 — Menjelang Berakhirnya Ujian',
      'label': 'Pastikan tombol Finalize tidak tertekan tidak sengaja',
    },
    {
      'section': 'Fase 7 — Menjelang Berakhirnya Ujian',
      'label': 'Jika ada kekurangan berkas → catat NIM, lapor ke LSC',
    },

    // FASE 8
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Ruman: Lock Keyboard',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Upload backup jawaban, pastikan last modified valid',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label':
          'Pastikan backup sudah diupload SEBELUM mahasiswa meninggalkan ruangan',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Paraf lembar ujian setelah jawaban dikumpulkan',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Jangan lepas perekat amplop pengumpulan berkas',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Isi jawaban yang diperlukan di lembar/berkas terkait',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Netfile Manager: login EXAM / T3s.tify!',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Submit di Bimay Pengawas',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label':
          'Bimay Pengawas → List → Ctrl+P → simpan PDF dengan format nama file yang benar',
    },
    {
      'section': 'Fase 8 — Setelah Ujian Berakhir (Submission)',
      'label': 'Pilih folder Kemanggisan2520, upload PDF',
    },

    // FASE 9
    {'section': 'Fase 9 — Selesai Mengawas', 'label': 'Clear FTP'},
    {'section': 'Fase 9 — Selesai Mengawas', 'label': 'Clear Drive D'},
    {'section': 'Fase 9 — Selesai Mengawas', 'label': 'Restart PC'},
    {
      'section': 'Fase 9 — Selesai Mengawas',
      'label': 'Segera kembalikan berkas ujian ke LSC',
    },
  ];

  int sortOrder = 0;
  for (final item in uapItems) {
    await db.insertTemplateItem(
      ChecklistTemplateItem(
        label: item['label']!,
        section: item['section']!,
        sortOrder: sortOrder++,
        type: 'UAP',
      ),
    );
  }

  sortOrder = 0;
  for (final item in uasItems) {
    await db.insertTemplateItem(
      ChecklistTemplateItem(
        label: item['label']!,
        section: item['section']!,
        sortOrder: sortOrder++,
        type: 'UAS',
      ),
    );
  }
}
