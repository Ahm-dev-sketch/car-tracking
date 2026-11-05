# Audit alur bisnis dan perbaikan driver

## Status dan batas pemeriksaan

Audit ini menelusuri kode driver, trip, booking, dispatch, assignment, otorisasi,
tracking, realtime, dan cache PWA. Perbaikan dan tes regresi sudah ditulis.
**Tes, build, browser, database, dan pengujian konkurensi PostgreSQL belum dijalankan.**
Terminal sandbox tidak tersedia, dan izin eksekusi di luar sandbox sebelumnya
ditolak. Pemeriksaan yang tersedia adalah pembacaan kode dan diagnostics editor;
itu bukan pengganti pengujian runtime.

Keluhan tombol **Start trip with D 8888 GH** belum direproduksi pada browser dan
data pengguna. Cacat yang terkonfirmasi di kode adalah tidak adanya pending state,
penantian GPS tanpa watchdog independen, dan error yang jauh dari tombol.
Penyebab spesifik pada perangkat pengguna—izin lokasi, HTTP tidak aman, koneksi,
atau konflik unit—masih perlu dibuktikan dengan uji langsung.

## Temuan yang diperbaiki

| Area | Cacat pada kode | Perbaikan |
| --- | --- | --- |
| Start trip | Menunggu GPS tanpa indikator; klik berulang; error tidak terlihat dekat aksi | Satu jalur mulai trip, proteksi aksi berulang, fase Getting GPS / Starting trip, watchdog GPS 15 detik, request HTTP berbatas waktu, error lokal |
| Hasil mutasi | Respons hilang atau notifikasi gagal dapat terlihat seperti trip gagal padahal sudah tersimpan | Rekonsiliasi status server setelah error request; notifikasi nonfatal dan publikasi realtime dibatasi waktu |
| Trip | Validasi driver/unit di luar transaksi; dua start berbeda unit dapat memakai driver yang sama | Validasi ulang di bawah lock booking → vehicle → driver → trip, termasuk trip aktual, assignment, reservasi, akun aktif, dan sesi driver lain |
| Status booking | Progres tanpa trip, arrival mengembalikan status perjalanan yang sudah berjalan, penyelesaian sebelum penumpang naik | Progres memerlukan trip yang cocok; arrival hanya dari DRIVER_EN_ROUTE dan idempoten pada ARRIVED; penyelesaian booking hanya dari IN_PROGRESS |
| Hentikan pickup | Berhenti sebelum boarding dapat salah dianggap booking selesai | Dashboard memakai abort untuk pickup yang belum IN_PROGRESS; booking kembali DRIVER_ASSIGNED untuk dicoba lagi |
| Selesai trip | Sesi server berakhir tetapi GPS browser masih berjalan; driver dianggap AVAILABLE tanpa sesi | Trip selesai/abort menutup sesi, driver OFFLINE, snapshot OFFLINE; browser menghentikan pengumpulan lalu mencoba flush sebelum menutup trip |
| Sesi online | Online tanpa kendaraan; sesi unit milik driver lain; status dan kendaraan sesi tidak sinkron | Kendaraan wajib tersedia/kompatibel, unit tidak dipakai sesi driver lain, sesi tersinkron ke unit trip |
| Assignment | Mirror driver–unit terisi tanpa riwayat assignment; unit kemudian tidak bisa dilepas | Trip dan dispatch membuat riwayat assignment; unassign dapat merekonsiliasi mirror lama yang cocok, tanpa menghapus riwayat atau mengabaikan trip/booking aktif |
| Dashboard | Sepuluh booking terakhir dapat menyembunyikan pickup; status trip hilang setelah refresh; pencarian saling menimpa | Filter workflow driver di server sebelum pagination, baca seluruh halaman workflow, booking.status dari config, refresh foreground/polling, abaikan respons pencarian lama |
| Profil driver | Halaman My Assigned Vehicle memanggil daftar driver khusus admin dan diam-diam mengabaikan 403 | API /api/me menyediakan profil milik driver sendiri melalui select eksplisit; halaman tidak lagi memakai endpoint daftar admin |
| GPS upload | HTTP/network error ditelan sehingga buffer menganggap titik sudah terkirim; flush tumpang tindih | Error transport diteruskan, flush diserialisasi, buffer terbatas mempertahankan titik terbaru, penolakan titik ditampilkan |
| GPS server | Batch terlambat dapat memundurkan posisi atau menghidupkan kembali snapshot offline | Lock vehicle → driver sebelum validasi ulang sesi; history dan snapshot ditulis atomik setelah validasi; titik lama tidak memundurkan snapshot/broadcast |
| Dispatch | Offer kedaluwarsa/ditolak dapat menghidupkan booking terminal; kendaraan RESERVED tidak mendapat kandidat | Validasi offer/booking di bawah lock, pembatalan offer, status terminal dilindungi, unit RESERVED yang kompatibel diperhitungkan |
| Fleet lifecycle | Perubahan status/deaktivasi dapat melewati trip, booking, assignment, atau sesi aktif | Guard pada assignment, perubahan status, maintenance, dan deaktivasi; snapshot ikut OFFLINE saat sesi ditutup |
| Otorisasi | Role JWT dapat basi; nested user dapat membawa password hash; kontak driver terlalu terbuka | Akun/role dibaca ulang dari DB, select user eksplisit, scope booking/tracking dan redaksi kontak/license |
| Realtime | ID kendaraan kiriman klien dipercaya; publikasi memakai fallback secret publik | Subscription fail-closed berdasarkan claims terverifikasi, recipient pribadi dibatasi, secret publik ditolak |
| PWA | API/HTML privat dapat tersimpan dan diputar ulang untuk akun lain | Cache versi baru menghapus cache lama; API, HTML privat dan RSC tidak di-cache |
| Test runner | npm test dapat ikut menjalankan suite phase yang melakukan TRUNCATE | Default test memakai daftar pola unit/regresi; suite database/realtime integrasi dipisah secara eksplisit |

## Aturan lifecycle setelah perbaikan

- **Booking:** DRIVER_ASSIGNED → start trip → DRIVER_EN_ROUTE → arrived → ARRIVED
  → passengers boarded → IN_PROGRESS → finish → COMPLETED.
- **Tanpa booking:** pilih unit yang kompatibel → GPS nyata → ACTIVE → finish → COMPLETED.
- **Stop pickup:** trip ABORTED, booking tetap DRIVER_ASSIGNED untuk retry; bukan COMPLETED.
- **Finish/abort:** driver OFFLINE, sesi ENDED, telemetry snapshot OFFLINE.
- **Standing assignment:** tetap RESERVED setelah trip, sampai admin melakukan unassign.
  Trip berikutnya boleh memakai unit yang sama jika tidak ada konflik.
- **Ganti unit:** assignment lama harus dilepas dulu; unit tidak dipindahkan diam-diam.
- **Ad-hoc tanpa waktu selesai terencana:** tidak boleh mengambil unit/driver dengan
  booking committed lain; gunakan tombol mulai booking yang bersangkutan.
- GPS nyata dan persetujuan pengguna tetap wajib. Tidak ada koordinat palsu atau bypass izin.

## Uji manual yang perlu dilakukan

1. Buka melalui **HTTPS**. `http://localhost` boleh pada perangkat yang sama;
   alamat LAN HTTP dari ponsel umumnya bukan secure context.
2. Login driver, pilih unit yang tersedia, klik Start trip satu kali. Tombol harus
   langsung berubah Getting GPS, lalu Starting trip, lalu menampilkan trip aktif.
3. Tolak izin lokasi: pesan izin harus terlihat dekat tombol, tanpa trip dibuat.
4. Biarkan prompt GPS tidak dijawab: setelah sekitar 15 detik tampil timeout dan
   tombol dapat dicoba ulang. Mengizinkan prompt terlambat tidak boleh membuat trip otomatis.
5. Klik dua kali / buka dua tab: paling banyak satu trip aktif untuk driver/unit.
   Uji ini perlu PostgreSQL sungguhan, bukan hanya mock.
6. Mulai booking, refresh halaman, tandai arrival, boarding, lalu finish. Status
   tidak boleh mundur atau kehilangan tombol tahap berikutnya.
7. Stop saat masih menuju pickup: booking tetap assigned, sesi offline, lalu dapat
   dicoba lagi. Booking tidak boleh masuk statistik completed.
8. Finish trip: GPS harus berhenti dan driver offline. Go online diperlukan untuk
   menerima offer berikutnya. Assignment unit tetap terlihat sampai dilepas admin.
9. Admin unassign unit yang selesai: mirror dibersihkan, unit tersedia, riwayat tetap
   ada. Tolak unassign jika trip atau booking committed masih aktif.
10. Putuskan koneksi ketika upload: error terlihat dan buffer mencoba ulang tanpa
    flush paralel. Setelah koneksi pulih, posisi tidak boleh melompat mundur.
11. Buka My Assigned Vehicle sebagai driver: hanya profil/unit miliknya terlihat.
12. Logout admin, login user lain, lalu offline: PWA tidak boleh menampilkan ulang
    data tracking atau HTML privat akun sebelumnya.
13. Matikan realtime shim: aksi bisnis tetap berhasil. HTTP polling tetap tersedia.

## Menjalankan validasi

```sh
npm test
npm run build
```

Perintah di atas **belum dijalankan oleh agent**. Diagnostics editor pada berkas
utama yang diperbaiki tidak melaporkan error; masih ada warning dan temuan lain
pada proyek, jadi tidak ada klaim lint/typecheck/build seluruh proyek bersih.

**Peringatan database:** `npm run test:integration` dan `npm run test:all` menjalankan
suite lama yang melakukan **TRUNCATE** pada `car_tracking_test`, serta tes server
WebSocket lokal. Siapkan database pengujian terpisah beserta migrasi terlebih dahulu;
jangan jalankan terhadap database berisi data penting. Suite mocked tidak membuktikan
lock PostgreSQL, constraint, adapter Prisma, maupun perilaku browser/PWA di perangkat nyata.

## Batas yang tetap berlaku

- Instalasi ke home screen tidak menjadikan web app pelacak GPS background.
  Tab/aplikasi harus terbuka; lock screen dan background dapat menghentikan GPS.
- Token WebSocket ber-scope tidak ditambahkan dalam audit ini. Klien tanpa token
  yang sah tetap memakai REST polling; jangan membuka subscription publik.
- Notifikasi bersifat best effort dan dicatat di log bila gagal; tidak ditambahkan
  durable outbox atau jaminan pengiriman ulang.
- Tidak ada migrasi, bulk repair, penghapusan data, atau perubahan database yang dijalankan.
  Data lama yang kontradiktif tidak otomatis ditimpa; guard akan menolak dan meminta
  rekonsiliasi oleh admin.
- Audit kode ini tidak menjamin seluruh bug tersembunyi sudah hilang. Pemeriksaan
  runtime terhadap data/perangkat pengguna dan uji konkurensi tetap diperlukan.
