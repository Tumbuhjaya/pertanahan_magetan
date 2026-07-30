var connection = require('../database').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , path = require('path')
  ,  sha1 = require('sha1');
  var sql_enak = require('../database/mysql_enak.js').connection;
  var cek_login = require('./login').cek_login;
  var cek_login_google = require('./login').cek_login_google;
  var cek_login_all = require('./login').cek_login_all;

  var dbgeo = require("dbgeo");
  var multer = require("multer");
  var st = require('knex-postgis')(sql_enak);
  var deasync = require('deasync');
  path.join(__dirname, '/public/foto')
  router.use(bodyParser.json());
  router.use(bodyParser.urlencoded({ extended: true }));

  router.use(cookieParser() );
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});
// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/foto/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now()+'-'+file.originalname)
  }
})

var upload = multer({ storage: storage })

//start-------------------------------------
router.get('/', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_pertanahan/list'); 
});

router.get('/insert', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_pertanahan/insert'); 
});

router.get('/edit/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_pertanahan/edit'); 
});
// GET /manajemen_pertanahan/detail/:id
router.get('/detail/:id', cek_login_all, function(req, res) {
  const id = req.params.id;
  sql_enak('penguasaan_tanah')
    .where('id', id)
    .first()
    .then(function(data) {
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan' });
      }
      return sql_enak('koordinat_tanah')
        .where('penguasaan_tanah_id', id)
        .orderBy('urutan', 'asc')
        .then(function(koordinat) {
          data.koordinat = koordinat;
          res.json({ status: 'success', data: data });
        });
    })
    .catch(function(err) {
      console.error(err);
      res.status(500).json({ status: 'error', message: err.message });
    });
});

// POST /manajemen_pertanahan/update/:id
router.post('/update/:id', upload.fields([
  { name: 'file_shp', maxCount: 1 },
  { name: 'file_shx', maxCount: 1 },
  { name: 'file_dbf', maxCount: 1 }
]), function(req, res) {
  const id = req.params.id;
  const {
    nama_penguasaan, nik, no_kk, alamat_ktp, alamat_rumah,
    kecamatan, kelurahan_desa, luas_tanah, no_sertifikat,
    jenis_hak, no_hak, tahun_kepemilikan, nib,
    batas_utara, batas_selatan, batas_timur, batas_barat, znt,
    nop, luas_bumi, pajak_bumi, luas_bangunan, pajak_bangunan,
    njop, tagihan, tanggal_pembayaran_terakhir, status_bayar,
    pemanfaatan_lahan, peruntukan_lahan, zona_ruang, kelas_bumi, kelas_bangunan,
    latitude, longitude
  } = req.body;

  // Validasi koordinat
  if (!latitude || !longitude || !Array.isArray(latitude) || !Array.isArray(longitude)) {
    return res.status(400).json({ status: 'error', message: 'Koordinat harus dikirim sebagai array.' });
  }
  if (latitude.length < 3 || longitude.length < 3 || latitude.length !== longitude.length) {
    return res.status(400).json({ status: 'error', message: 'Koordinat minimal 3 titik dan jumlah sama.' });
  }

  sql_enak.transaction(function(trx) {
    return trx('penguasaan_tanah')
      .where('id', id)
      .update({
        nama_penguasaan,
        nik,
        no_kk,
        alamat_ktp,
        alamat_rumah,
        kecamatan,
        kelurahan_desa,
        luas_tanah: parseFloat(luas_tanah) || 0,
        no_sertifikat,
        jenis_hak,
        no_hak,
        tahun_kepemilikan,
        nib,
        batas_utara,
        batas_selatan,
        batas_timur,
        batas_barat,
        znt,
        nop,
        luas_bumi: parseFloat(luas_bumi) || 0,
        pajak_bumi: parseFloat(pajak_bumi) || 0,
        luas_bangunan: parseFloat(luas_bangunan) || 0,
        pajak_bangunan: parseFloat(pajak_bangunan) || 0,
        njop: parseFloat(njop) || 0,
        tagihan: parseFloat(tagihan) || 0,
        tanggal_pembayaran_terakhir,
        status_bayar,
        pemanfaatan_lahan,
        peruntukan_lahan,
        zona_ruang,
        kelas_bumi,
        kelas_bangunan,
        updated_at: new Date()
      })
      .then(function() {
        // Hapus koordinat lama
        return trx('koordinat_tanah')
          .where('penguasaan_tanah_id', id)
          .del();
      })
      .then(function() {
        // Insert koordinat baru
        const koordinatData = latitude.map((lat, index) => ({
          penguasaan_tanah_id: id,
          latitude: parseFloat(lat),
          longitude: parseFloat(longitude[index]),
          urutan: index + 1,
          created_at: new Date()
        }));
        return trx('koordinat_tanah').insert(koordinatData);
      })
  })
  .then(function() {
    res.json({ status: 'success', message: 'Data berhasil diperbarui', id: id });
  })
  .catch(function(err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  });
});
// GET /manajemen_pertanahan/list
router.get('/list', cek_login_all, function(req, res) {
  sql_enak('penguasaan_tanah')
    .select('*')
    .orderBy('id', 'desc')
    .then(function(data) {
      res.json({ data: data });
    })
    .catch(function(err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
});

// GET /manajemen_pertanahan/hapus/:id
router.get('/hapus/:id', cek_login_all, function(req, res) {
  const id = req.params.id;
  sql_enak.transaction(function(trx) {
    return trx('koordinat_tanah')
      .where('penguasaan_tanah_id', id)
      .del()
      .then(function() {
        return trx('koordinat_tanah')
          .where('penguasaan_tanah_id', id)
          .del();
      })
      .then(function() {
        return trx('penguasaan_tanah')
          .where('id', id)
          .del();
      });
  })
  .then(function() {
    res.json({ status: 'success', message: 'Data berhasil dihapus' });
  })
  .catch(function(err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  });
});


router.post('/insert', upload.fields([
  { name: 'file_shp', maxCount: 1 },
  { name: 'file_shx', maxCount: 1 },
  { name: 'file_dbf', maxCount: 1 }
]), async (req, res) => {
  const {
    nama_penguasaan, nik, no_kk, alamat_ktp, alamat_rumah,
    kecamatan, kelurahan_desa, luas_tanah, no_sertifikat,
    jenis_hak, no_hak, tahun_kepemilikan, nib,
    batas_utara, batas_selatan, batas_timur, batas_barat, znt,
    nop, luas_bumi, pajak_bumi, luas_bangunan, pajak_bangunan,
    njop, tagihan, tanggal_pembayaran_terakhir, status_bayar,
    pemanfaatan_lahan, peruntukan_lahan, zona_ruang, kelas_bumi, kelas_bangunan,
    latitude, longitude
  } = req.body;

  // Validasi koordinat
  if (!latitude || !longitude || !Array.isArray(latitude) || !Array.isArray(longitude)) {
    return res.status(400).json({ status: 'error', message: 'Koordinat harus dikirim sebagai array.' });
  }
  if (latitude.length < 3 || longitude.length < 3 || latitude.length !== longitude.length) {
    return res.status(400).json({ status: 'error', message: 'Koordinat minimal 3 titik dan jumlah latitude/longitude sama.' });
  }

  // Jalankan transaksi
  sql_enak.transaction(function(trx) {
    return trx('penguasaan_tanah')
      .insert({
        nama_penguasaan,
        nik,
        no_kk,
        alamat_ktp,
        alamat_rumah,
        kecamatan,
        kelurahan_desa,
        luas_tanah: parseFloat(luas_tanah) || 0,
        no_sertifikat,
        jenis_hak,
        no_hak,
        tahun_kepemilikan,
        nib,
        batas_utara,
        batas_selatan,
        batas_timur,
        batas_barat,
        znt,
        nop,
        luas_bumi: parseFloat(luas_bumi) || 0,
        pajak_bumi: parseFloat(pajak_bumi) || 0,
        luas_bangunan: parseFloat(luas_bangunan) || 0,
        pajak_bangunan: parseFloat(pajak_bangunan) || 0,
        njop: parseFloat(njop) || 0,
        tagihan: parseFloat(tagihan) || 0,
        tanggal_pembayaran_terakhir,
        status_bayar,
        pemanfaatan_lahan,
        peruntukan_lahan,
        zona_ruang,
        kelas_bumi,
        kelas_bangunan,
        created_at: new Date()
      })
      .then(function(result) {
        const id = Array.isArray(result) ? result[0] : result;

        const koordinatData = latitude.map(function(lat, index) {
          return {
            penguasaan_tanah_id: id,
            latitude: parseFloat(lat),
            longitude: parseFloat(longitude[index]),
            urutan: index + 1,
            created_at: new Date()
          };
        });

        return trx('koordinat_tanah')
          .insert(koordinatData)
          .then(function() {
            res.status(201).json({ status: 'success', id: id });
          });
      });
  })
  .catch(function(err) {
    console.error('Error transaksi:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Terjadi kesalahan.' });
  });
});

router.get('/import_shp', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_pertanahan/import_data'); 
});

module.exports = router;
