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
router.get('/import_data', cek_login_all,async function(req, res) {
    let a = await sql_enak.raw(`select a.id ,a.id_kec ,a.kdepum ,a.kecamatan  from batas_admin_kecamatan a`)

  res.render('content-backoffice/manajemen_pertanahan/import_data.ejs',{kec:a[0]}); 
});

router.get('/insert', cek_login_all,async function(req, res) {
  let a = await sql_enak.raw(`select a.id ,a.id_kec ,a.kdepum ,a.kecamatan  from batas_admin_kecamatan a`)
  res.render('content-backoffice/manajemen_pertanahan/insert',{kec:a[0]}); 
});

router.get('/get_kel/:id_kec', cek_login_all,async function(req, res) {
  let a = await sql_enak.raw(`select  id, namobj, id_kec, id_desa  from batas_admin_desa a where id_kec = ? `,[req.params.id_kec])
  res.json({data:a[0]})
})

router.get('/edit/:id', cek_login_all, async function(req, res) {
  try {
    const id = req.params.id;
    
    // Ambil data pertanahan berdasarkan id
    const dataPertanahan = await sql_enak.raw(`
      SELECT *
      FROM persil_magetan a 
      WHERE a.id = ? and deleted = 0
    `, [id]);
    
    // Ambil data kecamatan untuk dropdown
    const kec = await sql_enak.raw(`SELECT a.id, a.id_kec, a.kdepum, a.kecamatan FROM batas_admin_kecamatan a`);
    
    // Ambil data kelurahan berdasarkan kecamatan yang dipilih
    let kelurahan = [];
    if (dataPertanahan[0] && dataPertanahan[0][0] && dataPertanahan[0][0].id_kec) {
      kelurahan = await sql_enak.raw(`
        SELECT a.id_desa, a.namobj 
        FROM batas_admin_desa a 
        WHERE a.id_kec = ?
      `, [dataPertanahan[0][0].id_kec]);
    }
    
    res.render('content-backoffice/manajemen_pertanahan/edit', {
      data: dataPertanahan[0] ? dataPertanahan[0][0] : null,
      kec: kec[0],
      kelurahan: kelurahan[0],
      id: id
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Terjadi kesalahan');
  }
});

// GET /manajemen_pertanahan/detail/:id
router.get('/detail/:id', cek_login_all, function(req, res) {
  const id = req.params.id;
  sql_enak.raw('select * from persil_magetan where id = ?',[id])
    .then(function(data) {
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan' });
      }
          res.json({ status: 'success', data: data[0] });

    })
    .catch(function(err) {
      console.error(err);
      res.status(500).json({ status: 'error', message: err.message });
    });
});

// GET /manajemen_pertanahan/list
router.post('/list', cek_login_all, async function(req, res) {
    try {
        // Ambil parameter dari DataTables
        const draw = parseInt(req.body.draw) || 1;
        const start = parseInt(req.body.start) || 0;
        const length = parseInt(req.body.length) || 10;
        const searchValue = req.body.search?.value || '';
        
        // Handle sorting - DataTables mengirim sebagai array
        let orderBy = 'a.id';
        let orderDir = 'asc';
        
        if (req.body.order && req.body.order.length > 0) {
            const orderColumn = parseInt(req.body.order[0].column);
            const orderDirParam = req.body.order[0].dir || 'asc';
            
            // Mapping kolom
            const columns = {
                0: 'a.id',
                1: 'a.nm_pnguasa',
                2: 'a.almt_ktp',
                3: 'c.kecamatan',
                4: 'b.namobj',
                5: 'a.l_tanah',
                6: 'a.l_bangunan',
                7: 'a.nop'
            };
            
            orderBy = columns[orderColumn] || 'a.id';
            orderDir = orderDirParam;
        }
        
        console.log('Request params:', { draw, start, length, searchValue, orderBy, orderDir });
        
        // Query dasar
        let baseQuery = `
            FROM persil_magetan a 
            LEFT JOIN batas_admin_desa b ON a.kd_kel = b.id_desa 
            LEFT JOIN batas_admin_kecamatan c ON b.id_kec = c.id_kec 
            WHERE a.deleted = 0
        `;
        
        // Search conditions
        let searchCondition = '';
        const searchParams = [];
        
        if (searchValue) {
            const likePattern = `%${searchValue}%`;
            searchCondition = ` AND (
                a.nm_pnguasa LIKE ? OR 
                a.almt_ktp LIKE ? OR 
                b.namobj LIKE ? OR 
                c.kecamatan LIKE ? OR 
                a.nop LIKE ? OR
                a.l_tanah LIKE ? OR
                a.l_bangunan LIKE ?
            )`;
            searchParams.push(
                likePattern, likePattern, likePattern, 
                likePattern, likePattern, likePattern, likePattern
            );
        }
        
        // Get total records
        const totalQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const totalResult = await sql_enak.raw(totalQuery, []);
        const totalRecords = totalResult[0]?.[0]?.total || 0;
        
        // Get filtered records
        const filteredQuery = `SELECT COUNT(*) as filtered ${baseQuery} ${searchCondition}`;
        const filteredResult = await sql_enak.raw(filteredQuery, searchParams);
        const filteredRecords = filteredResult[0]?.[0]?.filtered || 0;
        
        // Get data
        let dataQuery = `
            SELECT 
                a.*, 
                b.namobj as kelurahan_desa, 
                c.kecamatan as kecamatan 
            ${baseQuery} 
            ${searchCondition}
            ORDER BY ${orderBy} ${orderDir}
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...searchParams, length, start];
        const dataResult = await sql_enak.raw(dataQuery, dataParams);
        
        // Format response
        const response = {
            draw: draw,
            recordsTotal: totalRecords,
            recordsFiltered: filteredRecords,
            data: dataResult[0] || []
        };
        
        console.log(`Returning ${response.data.length} records`);
        res.json(response);
        
    } catch (err) {
        console.error('Error in /list endpoint:', err);
        res.status(500).json({
            draw: parseInt(req.body.draw) || 1,
            recordsTotal: 0,
            recordsFiltered: 0,
            data: [],
            error: err.message
        });
    }
});

// GET /manajemen_pertanahan/hapus/:id
router.get('/hapus/:id', cek_login_all, function(req, res) {
  const id = req.params.id;
   sql_enak("persil_magetan").where("id", req.params.id)
  .update({deleted:1})
  .then(function() {
    res.json({ status: 'success', message: 'Data berhasil dihapus' });
  })
  .catch(function(err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  });
});


router.post('/submit_insert', function(req, res) {
  var idne ="";
  var post = {}
 post = req.body;
 delete post['x[]']
  delete post['y[]']

  post['SHAPE']= st.geomFromText(post['SHAPE'], 4326);
   console.log(post,'post persil_magetan')

   sql_enak.insert(post).into("persil_magetan").then(function (id) {
  console.log(id);
})
.finally(function() {
  //sql_enak.destroy();
  res.redirect('/manajemen_pertanahan'); 
});
});

router.post('/submit_edit', function(req, res){
  var post = {}
 post = req.body;
 delete post['x[]']
  delete post['y[]']
  
  post['SHAPE']= st.geomFromText(post['SHAPE'], 4326);
   sql_enak("persil_magetan").where("id", req.body.id)
  .update(post).then(function (count) {
 console.log(count);
})
.finally(function() {
  //sql_enak.destroy();
  res.redirect('/manajemen_pertanahan'); 
});
});
module.exports = router;
