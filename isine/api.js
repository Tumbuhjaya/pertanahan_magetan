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
  let table = 'kategori'
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

router.post('/unit',cek_login,async function(req, res) {
 let {kamar_id,lantai_id,count,tagihan,cari,rusun_id ,limit,offset,status_kamar,jumlah_penghuni,kamar_penghuni_id} = req.body
 console.log(req.body,req.user[0],'req.user[0],');
 
  let value = []
  let a = ` per.*,st.selisih_tanggal,p2.penghuni_id,kp.kamar_penghuni_id,mt.tipe_tagihan,p2.nama_penghuni
  ,p.kamar_id,ns.nomor_sk_id,ns.tipe_sk, ns.nomor_penetapan, ns.tanggal_penetapan, ns.status_sk, ns.file_sk,ns.tanggal_berlaku_ijin
  ,p.status_kamar, p.kamar_rusun ,l.lantai ,t.tipe ,g.nama_gedung ,r.nama_rusun ,k.id_kec , k.id_kel , k.desa , k2.kecamatan,r.alamat 
  , CASE
    WHEN r.jenis = 2 THEN 'Rumah Susun'
    WHEN r.jenis = 3 THEN 'Rumah Susun Pekerja'
    WHEN r.jenis = 1 THEN 'Rumah Deret'
    ELSE 'Lain - Lain' END as jenis_rusun , COALESCE(SUM(t2.piutang ),0)  as piutang  , p8.sp_id ,p8.sp_ke,p8.file_sp `
  let b = ` `
  let c = ''
  let d = ''
  let s =''
  let joinan = ''
  if (kamar_id) {
    a = ' *,p.kamar_id,r.rusun_id,g.gedung_id,l.lantai_id,ns.nomor_sk_id,p2.penghuni_id, COALESCE(SUM(t2.piutang ),0)  as piutang  '
    b+= '   and  p.kamar_id = ? '
    value.push(kamar_id)
  }
  if (rusun_id) {
    b+= '   and  r.rusun_id = ? '
    value.push(rusun_id)
  }
    if (kamar_penghuni_id) {
          a = ' *,p.kamar_id,r.rusun_id,g.gedung_id,l.lantai_id,ns.nomor_sk_id,p2.penghuni_id, COALESCE(SUM(t2.piutang ),0)  as piutang  '

    b+= '   and  kp.kamar_penghuni_id = ? '
    value.push(kamar_penghuni_id)
  }
  if (req.user[0].is_admin==2) {
        b+= '   and  r.rusun_id = ? '
    value.push(req.user[0].rusun_id)
  }
    if (lantai_id) {
    b+= '   and  l.lantai_id = ? '
    s+= ' *,'
    value.push(lantai_id)
  }
//    if (status_kamar==1) {
//     b+= '    and p2.penghuni_id is null  '
//   }else    if (status_kamar==2) {
//     b+= '    and p2.penghuni_id is not null  '
//   }
    if (jumlah_penghuni==2) {
    b+= '    and p2.penghuni_id is null  '
  }else  if (jumlah_penghuni==1) {
    b+= '    and p2.penghuni_id is not null  '
  }
      if (status_kamar) {
    b+= '    and p.status_kamar =  ? '
    value.push(status_kamar)
  }
  if (tagihan) {
    c= '   and  t2.tagihan is not null '
  }
  if (cari) {
          b += ` and ((CASE
            WHEN r.jenis = 2 THEN 'Rumah Susun'
            WHEN r.jenis = 3 THEN 'Rumah Susun Pekerja'
            WHEN r.jenis = 1 THEN 'Rumah Deret'
            ELSE 'Lain - Lain'
        END) like '%${cari}%'  or p2.nama_penghuni like '%${cari}%'  or p2.nik like '%${cari}%'  or p.kamar_rusun like '%${cari}%' or p.keterangan_unit like '%${cari}%'  or r.nama_rusun like '%${cari}%' or g.nama_gedung like '%${cari}%' or l.lantai like '%${cari}%' or k2.kecamatan like '%${cari}%' or k.desa like '%${cari}%' or r.alamat like '%${cari}%'  )`

  }
  b+=` group by p.kamar_id `
 if (count) {
    a=' p.kamar_id '
    d=`select count(*) as jml from (`
    b+=` ) as y `

  }
      joinan = `     
      LEFT JOIN (
      SELECT
        MAX(sk2.nomor_sk_id) AS max_nomor_sk_id,
        sk2.kamar_penghuni_id
      FROM
        nomor_sk sk2
      WHERE
        sk2.deletedAt IS NULL
      GROUP BY
        sk2.kamar_penghuni_id
    ) AS sk_terakhir ON sk_terakhir.kamar_penghuni_id = kp.kamar_penghuni_id
    LEFT JOIN (
      SELECT
        MAX(per2.pernyataan_id) AS max_pernyataan_id,
        per2.kamar_penghuni_id
      FROM
        pernyataan per2
      WHERE
        per2.deletedAt IS NULL
      GROUP BY
        per2.kamar_penghuni_id
    ) AS per_terakhir ON per_terakhir.kamar_penghuni_id = kp.kamar_penghuni_id
         left join (select DATEDIFF(t.tanggal_tagihan,CURRENT_DATE()) as selisih_tanggal , t.kamar_penghuni_id 
from tagihan t where t.status_piutang = 0 and t.deletedAt is null  and t.kamar_penghuni_id is not null  group by t.kamar_penghuni_id
) as st on st.kamar_penghuni_id = kp.kamar_penghuni_id
     left join nomor_sk ns  on sk_terakhir.max_nomor_sk_id = ns.nomor_sk_id and ns.deletedAt is null 
     left join pernyataan per  on per.pernyataan_id = per_terakhir.max_pernyataan_id and ns.deletedAt is null 
      left join tagihan t2 on kp.kamar_penghuni_id  = t2.kamar_penghuni_id and t2.deletedAt is null and t2.status_piutang = 0
    left join lantai l on l.lantai_id = p.lantai_id and l.deletedAt is null 
    left join  gedung g on l.gedung_id = g.gedung_id and g.deletedAt is null 
    left join rusun r on g.rusun_id = r.rusun_id and r.deletedAt is null  
    left join kelurahan k on r.id_kel  = k.id_kelurahan 
    left join kecamatan k2 on k2.id_kec = k.id_kec 
    left join tipe t on t.tipe_id = p.tipe_id 
    left join master_tagihan mt on mt.lantai_id = p.lantai_id and mt.tipe_id  = p.tipe_id and mt.deletedAt is NULL 
        LEFT JOIN (select MAX(sp_id) as m_id , p.kamar_penghuni_id from sp p where p.deletedAt is null group by p.kamar_penghuni_id) p7
    ON p7.kamar_penghuni_id  = kp.kamar_penghuni_id 
    LEFT JOIN sp p8
    ON p8.sp_id  =  p7.m_id AND p8.deletedAt IS NULL `
    if (limit) {
          b += ` limit `+limit
    }
        if (offset) {
          b += ` offset `+offset
    }
   
  let sql = ` ${d} select ${s}${a}  from  kamar p  
  left join kamar_penghuni kp on kp.kamar_id = p.kamar_id  and kp.deletedAt is null 
    left join penghuni p2 on p2.penghuni_id = kp.penghuni_id and p2.deletedAt is null 
    ${joinan}
    WHERE ISNULL(p.deletedAt) and p.kamar_id is not null   ${b}`
    console.log(sql,value);
    
  let data = await sql_enak.raw(sql,value)
  try {
      res.json({status:200,message:'sukses',data:data[0]})
  } catch (error) {
      res.json({status:500,message:'Gagal',data:error})
  }
})
router.post('/all_penghuni_by_kamar',cek_login,async function(req, res) {
 let {kamar_id,lantai_id,count,tagihan,cari,rusun_id ,limit,offset,status_kamar,jumlah_penghuni,kamar_penghuni_id} = req.body
 let value = []
 let a = ''
if (kamar_id) {
  a+= ` and k.kamar_id = ${kamar_id}  `
}
   a+= ` order by kp.deletedAt asc `
  let sql = `select *,DATE_FORMAT(ns.tanggal_berlaku_ijin ,'%d-%m-%Y' ) tanggal_berlaku_ijin2 ,DATE_FORMAT(ns.tanggal_berlaku_ijin ,'%Y-%m-%d' ) tanggal_berlaku_ijin
,DATE_FORMAT(ns.tanggal_penetapan  ,'%d-%m-%Y'  ) tanggal_penetapan2 ,DATE_FORMAT(ns.tanggal_penetapan ,'%Y-%m-%d' ) tanggal_penetapan,kp.deletedAt as tanggal_non_aktif from kamar k left join kamar_penghuni kp on k.kamar_id = kp.kamar_id 
      left join lantai l on l.lantai_id = k.lantai_id and l.deletedAt is null 
    left join  gedung g on l.gedung_id = g.gedung_id and g.deletedAt is null 
    left join rusun r on g.rusun_id = r.rusun_id and r.deletedAt is null
left join penghuni p on p.penghuni_id = kp.penghuni_id and p.deletedAt is null
left join ( select max(ns2.nomor_sk_id ) as max_nomor_sk_id , kamar_penghuni_id from nomor_sk ns2 where ns2.deletedAt is null group by kamar_penghuni_id) as ns2 on ns2.kamar_penghuni_id = kp.kamar_penghuni_id 
left join nomor_sk ns on ns.nomor_sk_id  = ns2.max_nomor_sk_id 
where  k.deletedAt is null ${a}`
    console.log(sql,value);
    
  let data = await sql_enak.raw(sql,value)
  try {
      res.json({status:200,message:'sukses',data:data[0]})
  } catch (error) {
      res.json({status:500,message:'Gagal',data:error})
  }
})
router.post('/jumlah_data_tiap_rusun',async function(req, res) {
    let str = ''
    let value = []
     if (req.query.id) {
        str += ` and r.rusun_id = ?`
        value.push(req.query.id)
    }
    let sql = `SELECT
    r.*,
    u.fullname,
    COALESCE(r2.jumlah_gedung, 0) AS jumlah_gedung,
    COALESCE(r3.jumlah_lantai, 0) AS jumlah_lantai,
    COALESCE(r4.jumlah_kamar, 0) AS jumlah_kamar,
    COALESCE(r5.jumlah_antrian, 0) AS jumlah_antrian,
    COALESCE(r6.jumlah_penghuni, 0) AS jumlah_penghuni,
    COALESCE(r4.jumlah_kamar-r6.jumlah_penghuni, 0) AS jumlah_kamar_kosong
FROM
    rusun r
LEFT JOIN
    user u ON u.rusun_id = r.rusun_id AND u.deleted = 0
LEFT JOIN (
    SELECT
        g.rusun_id,
        COUNT(g.gedung_id) AS jumlah_gedung
    FROM
        gedung g
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.rusun_id
) AS r2 ON r2.rusun_id = r.rusun_id
LEFT JOIN (
    SELECT
        g.rusun_id,
        COUNT(l.lantai_id) AS jumlah_lantai
    FROM
        gedung g
    LEFT JOIN
        lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.rusun_id
) AS r3 ON r3.rusun_id = r.rusun_id
LEFT JOIN (
    SELECT
        g.rusun_id,
        COUNT(k.kamar_id) AS jumlah_kamar
    FROM
        gedung g
    LEFT JOIN
        lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
    LEFT JOIN
        kamar k ON k.lantai_id = l.lantai_id AND k.deletedAt IS NULL
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.rusun_id
) AS r4 ON r4.rusun_id = r.rusun_id
LEFT JOIN (
    SELECT
        a.rusun_id,
        COUNT(a.antrian_id) AS jumlah_antrian
    FROM
        antrian a
    WHERE
        a.deletedAt IS NULL
    GROUP BY
        a.rusun_id
) AS r5 ON r5.rusun_id = r.rusun_id
LEFT JOIN (
    SELECT
        g.rusun_id,
        COUNT(p.penghuni_id ) AS jumlah_penghuni
    FROM
        gedung g
    LEFT JOIN
        lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
    LEFT JOIN
        kamar k ON k.lantai_id = l.lantai_id AND k.deletedAt IS NULL
      LEFT JOIN
        kamar_penghuni p ON k.kamar_id = p.kamar_id AND p.deletedAt IS NULL
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.rusun_id
) AS r6 ON r6.rusun_id = r.rusun_id
WHERE
    r.deletedAt IS NULL ${str}; `
    let data = await sql_enak.raw(sql,value)
  try {
      res.json({status:200,message:'sukses',data:data[0]})
  } catch (error) {
      res.json({status:500,message:'Gagal',data:error})
  }
})
router.post('/jumlah_data_tiap_gedung/:id',async function(req, res) {
    let str = ''
    let value = []
     if (req.params.id) {
        str += ` and g.rusun_id = ?`
        value.push(req.params.id)
    }
       if (req.params.gedung_id) {
        str += ` and g.gedung_id = ?`
        value.push(req.params.gedung_id)
    }
    let sql = `SELECT
    g.*,COALESCE(r3.jumlah_lantai, 0) AS jumlah_lantai,
    COALESCE(r4.jumlah_kamar, 0) AS jumlah_kamar,
    COALESCE(r5.jumlah_antrian, 0) AS jumlah_antrian,
    COALESCE(r6.jumlah_penghuni, 0) AS jumlah_penghuni,
    COALESCE(r4.jumlah_kamar-r6.jumlah_penghuni, 0) AS jumlah_kamar_kosong
FROM
    gedung g
LEFT JOIN (
    SELECT
        g.rusun_id,
        COUNT(l.lantai_id) AS jumlah_lantai
    FROM
        gedung g
    LEFT JOIN
        lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.rusun_id
) AS r3 ON r3.rusun_id = g.rusun_id
LEFT JOIN (
   SELECT
        g.gedung_id ,g.rusun_id ,
        COUNT(k.kamar_id) AS jumlah_kamar
    FROM
        gedung g
    LEFT JOIN
        lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
    LEFT JOIN
        kamar k ON k.lantai_id = l.lantai_id AND k.deletedAt IS NULL
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.gedung_id
) AS r4 ON r4.gedung_id = g.gedung_id
LEFT JOIN (
    SELECT
        a.rusun_id,
        COUNT(a.antrian_id) AS jumlah_antrian
    FROM
        antrian a
    WHERE
        a.deletedAt IS NULL
    GROUP BY
        a.rusun_id
) AS r5 ON r5.rusun_id = g.rusun_id
LEFT JOIN (
    SELECT
        g.rusun_id,g.gedung_id ,
        COUNT(p.penghuni_id ) AS jumlah_penghuni
    FROM
        gedung g
    LEFT JOIN
        lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
    LEFT JOIN
        kamar k ON k.lantai_id = l.lantai_id AND k.deletedAt IS NULL
      LEFT JOIN
        kamar_penghuni p ON k.kamar_id = p.kamar_id AND p.deletedAt IS NULL
    WHERE
        g.deletedAt IS NULL
    GROUP BY
        g.gedung_id 
) AS r6 ON r6.gedung_id  = g.gedung_id 
WHERE
    g.deletedAt IS NULL ${str}; `
    let data = await sql_enak.raw(sql,value)
  try {
      res.json({status:200,message:'sukses',data:data[0]})
  } catch (error) {
      res.json({status:500,message:'Gagal',data:error})
  }
})
router.post('/chart_target_tagihan',async function(req, res) {
    let {tahun} = req.body

try {
    let data = await sql_enak.raw(`SELECT
  months.bulan,
  COALESCE(SUM(t.target_tagihan ), 0) AS target_tagihan
FROM
  (
    SELECT 1 AS bulan
    UNION SELECT 2
    UNION SELECT 3
    UNION SELECT 4
    UNION SELECT 5
    UNION SELECT 6
    UNION SELECT 7
    UNION SELECT 8
    UNION SELECT 9
    UNION SELECT 10
    UNION SELECT 11
    UNION SELECT 12
  ) AS months
LEFT JOIN target_tagihan  t ON months.bulan = t.bulan AND t.tahun = ${tahun||' year(NOW())'}
WHERE
  t.deletedAt IS NULL 
GROUP BY
  months.bulan
ORDER BY
  months.bulan;`)
  
    res.json({status:200,pesan:'sukses',data:data[0]}) 
  } catch (error) {
    console.log(error);
    res.json({status:500,pesan:'gagal',data:error}) 
  }
})
router.post('/chart_tagihan',async function(req, res) {
    let {tahun,terbayar} = req.body

try {
    let data = await sql_enak.raw(`SELECT
  months.bulan,
  COALESCE(SUM(t.piutang  ), 0) AS piu
FROM
  (
    SELECT 1 AS bulan
    UNION SELECT 2
    UNION SELECT 3
    UNION SELECT 4
    UNION SELECT 5
    UNION SELECT 6
    UNION SELECT 7
    UNION SELECT 8
    UNION SELECT 9
    UNION SELECT 10
    UNION SELECT 11
    UNION SELECT 12
  ) AS months
LEFT JOIN tagihan   t ON months.bulan = t.bulan AND t.tahun = ${tahun||' year(NOW())'} ${terbayar==1?'and t.status_piutang =1' : terbayar==0?'and t.status_piutang =0':''}
WHERE
  t.deletedAt IS NULL 
GROUP BY
  months.bulan
ORDER BY
  months.bulan;`)
  
    res.json({status:200,pesan:'sukses',data:data[0]}) 
  } catch (error) {
    console.log(error);
    res.json({status:500,pesan:'gagal',data:error}) 
  }
})
router.post('/chart_tagihan_rusun',async function(req, res) {
    let {tahun,terbayar} = req.body

try {
    let data = await sql_enak.raw(`SELECT
  r.nama_rusun AS label,
  COALESCE(SUM(t.piutang), 0) AS y
FROM
  rusun r
LEFT JOIN gedung g ON g.rusun_id = r.rusun_id AND g.deletedAt IS NULL
LEFT JOIN lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
LEFT JOIN kamar k ON k.lantai_id = l.lantai_id  AND k.deletedAt IS NULL
left join kamar_penghuni kp on kp.kamar_id = k.kamar_id 
LEFT JOIN tagihan t ON t.kamar_penghuni_id = kp.kamar_penghuni_id AND t.tahun = ${tahun||' year(NOW())'} ${terbayar==1?'and t.status_piutang =1' : terbayar==0?'and t.status_piutang =0':''} AND t.deletedAt IS NULL
where r.deletedAt is null
GROUP BY
  r.rusun_id, r.nama_rusun
ORDER BY
  r.nama_rusun;`)
  
    res.json({status:200,pesan:'sukses',data:data[0]}) 
  } catch (error) {
    console.log(error);
    res.json({status:500,pesan:'gagal',data:error}) 
  }
})
router.post('/chart_target_tagihan_rusun',async function(req, res) {
    let {tahun,terbayar} = req.body

try {
    let data = await sql_enak.raw(`SELECT
  r.nama_rusun AS label,
  COALESCE(SUM(t.target_tagihan), 0) AS y
FROM
  rusun r
LEFT JOIN gedung g ON g.rusun_id = r.rusun_id AND g.deletedAt IS NULL
LEFT JOIN lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
LEFT JOIN kamar k ON k.lantai_id = l.lantai_id AND k.status_kamar = 1 AND k.deletedAt IS NULL
left join kamar_penghuni kp on kp.kamar_id = k.kamar_id AND kp.deletedAt IS NULL
LEFT JOIN target_tagihan t ON t.kamar_penghuni_id = kp.kamar_penghuni_id AND t.tahun = ${tahun||' year(NOW())'}  AND t.deletedAt IS NULL
where r.deletedAt is null
GROUP BY
  r.rusun_id, r.nama_rusun
ORDER BY
  r.nama_rusun;`)
  console.log(data[0]);
  
    res.json({status:200,pesan:'sukses',data:data[0]}) 
  } catch (error) {
    console.log(error);
    res.json({status:500,pesan:'gagal',data:error}) 
  }
})

router.get('/monitoring_billing',async function(req, res) {
  let {limit,offset,count,cari} = req.query
  let tambahan = ''
  let val = []
  let a = ` *,DATE_FORMAT(t.tanggal_bayar ,'%d-%m-%Y %H:%m') as tanggal_bayar `
  if (cari) {
    tambahan += ` and (r.nama_rusun LIKE ?
        OR CONCAT(g.nama_gedung, ' ', l.lantai, ' ', k.kamar_rusun) LIKE ?
        OR p.nama_penghuni LIKE ?
        OR t.tanggal_bayar LIKE ?
        OR t.piutang LIKE ?)`
    val.push(`%${cari}%`)
           val.push(`%${cari}%`)

       val.push(`%${cari}%`)

       val.push(`%${cari}%`)

       val.push(`%${cari}%`)


  }
  if (limit&&offset) {
    tambahan += ` limit ${limit} offset ${offset}`
  }
  if (count) {
    a = ' count(r.rusun_id) as jml '
  }
try {
    let data = await sql_enak.raw(`SELECT  ${a} FROM rusun r
LEFT JOIN gedung g ON g.rusun_id = r.rusun_id AND g.deletedAt IS NULL
LEFT JOIN lantai l ON l.gedung_id = g.gedung_id AND l.deletedAt IS NULL
LEFT JOIN kamar k ON k.lantai_id = l.lantai_id  AND k.deletedAt IS NULL
left join kamar_penghuni kp on kp.kamar_id = k.kamar_id 
LEFT JOIN penghuni p ON p.penghuni_id = kp.penghuni_id   AND p.deletedAt IS NULL
LEFT JOIN tagihan t ON t.kamar_penghuni_id = kp.kamar_penghuni_id   AND t.deletedAt IS NULL
where t.tagihan_id is not null and t.status_piutang =1 ` + tambahan,val)
  console.log(data[0]);
  
    res.json({status:200,pesan:'sukses',data:data[0]}) 
  } catch (error) {
    console.log(error);
    res.json({status:500,pesan:'gagal',data:error}) 
  }
})
router.get('/monitoring_excel',async function(req, res) {
  let {tahun,bulan,gedung_id,rusun_id} = req.query
  let a = ''
  let value = []
  if (tahun) {
    a += ' and t.tahun = ? '
    value.push(tahun)
  }
    if (bulan) {
    a += ' and t.bulan = ? '
    value.push(bulan)
  }
      if (gedung_id) {
    a += ' and g.gedung_id = ? '
    value.push(gedung_id)
  }
        if (rusun_id) {
    a += ' and r.rusun_id = ? '
    value.push(rusun_id)
  }
 let body_sql = ` from (
        SELECT 1 AS minggu, 'Minggu 1' AS periode_mingguan, 1 AS tgl_mulai, 7 AS tgl_akhir
        UNION ALL SELECT 2, 'Minggu 2', 8, 14
        UNION ALL SELECT 3, 'Minggu 3', 15, 21
        UNION ALL SELECT 4, 'Minggu 4', 22, 31
    ) AS m
LEFT JOIN
    (
        -- Subquery Anda yang asli untuk mendapatkan data tagihan
        SELECT
            tanggal_tagihan,
            YEAR(tanggal_tagihan) AS tahun,
            MONTH(tanggal_tagihan) AS bulan,
            CASE MONTH(tanggal_tagihan)
                WHEN 1 THEN 'Januari' WHEN 2 THEN 'Februari' WHEN 3 THEN 'Maret'
                WHEN 4 THEN 'April'   WHEN 5 THEN 'Mei'      WHEN 6 THEN 'Juni'
                WHEN 7 THEN 'Juli'    WHEN 8 THEN 'Agustus'  WHEN 9 THEN 'September'
                WHEN 10 THEN 'Oktober' WHEN 11 THEN 'November' WHEN 12 THEN 'Desember'
            END AS bulan_text,
            piutang, g.nama_gedung, r.nama_rusun
        FROM
            tagihan t LEFT JOIN kamar_penghuni kp ON kp.kamar_penghuni_id = t.kamar_penghuni_id AND kp.deletedAt IS NULL
            LEFT JOIN kamar k ON k.kamar_id = kp.kamar_id AND k.deletedAt IS NULL
            LEFT JOIN lantai l ON k.lantai_id = l.lantai_id AND l.deletedAt IS NULL
            LEFT JOIN gedung g ON g.gedung_id = l.gedung_id AND g.deletedAt IS NULL
            LEFT JOIN rusun r ON g.rusun_id = r.rusun_id AND r.deletedAt IS NULL
        WHERE t.deletedAt IS NULL  and t.status_piutang = 1 ${a}
    ) AS dt ON DAYOFMONTH(dt.tanggal_tagihan) BETWEEN m.tgl_mulai AND m.tgl_akhir `
    try {
       let data = await sql_enak.raw(`SELECT
    tahun,
    bulan_text , bulan,nama_gedung,nama_rusun,
    CASE
        WHEN DAYOFMONTH(tanggal_tagihan) BETWEEN 1 AND 7 THEN 'Minggu 1'
        WHEN DAYOFMONTH(tanggal_tagihan) BETWEEN 8 AND 14 THEN 'Minggu 2'
        WHEN DAYOFMONTH(tanggal_tagihan) BETWEEN 15 AND 21 THEN 'Minggu 3'
        WHEN DAYOFMONTH(tanggal_tagihan) >= 22 THEN 'Minggu 4'
    END AS periode_mingguan,
    MIN(tanggal_tagihan) AS tanggal_mulai_periode,
    MAX(tanggal_tagihan) AS tanggal_akhir_periode,
    SUM(piutang) AS total_pendapatan_mingguan
        ${body_sql} 
GROUP BY
    tahun,
    bulan,
    periode_mingguan
ORDER BY
    tahun,
    bulan,
    periode_mingguan;`,value)
    let data2 =await sql_enak.raw(`SELECT 1 AS bulan, 'Januari' AS bulan_text
UNION ALL SELECT 2, 'Februari'
UNION ALL SELECT 3, 'Maret'
UNION ALL SELECT 4, 'April'
UNION ALL SELECT 5, 'Mei'
UNION ALL SELECT 6, 'Juni'
UNION ALL SELECT 7, 'Juli'
UNION ALL SELECT 8, 'Agustus'
UNION ALL SELECT 9, 'September'
UNION ALL SELECT 10, 'Oktober'
UNION ALL SELECT 11, 'November'
UNION ALL SELECT 12, 'Desember'
ORDER BY bulan;`)
    let data3 =await sql_enak.raw(`SELECT
    tahun,
    SUM(piutang) AS total_pendapatan
        ${body_sql} ` ,value)
          res.status(200).json({ status: 200, message: "sukses", data: data[0],bulan:data2[0] ,total:data3[0]})
    } catch (error) {
       console.log(error);
      res.status(500).json({ status: 500, message: "gagal", data: error})
    }
})
router.get('/monitoring_target_excel',async function(req, res) {
  let {tahun,bulan,gedung_id,rusun_id} = req.query
  let a = ''
  let value = []
  if (tahun) {
    a += ' and t.tahun = ? '
    value.push(tahun)
  }
    if (bulan) {
    a += ' and t.bulan = ? '
    value.push(bulan)
  }
      if (gedung_id) {
    a += ' and g.gedung_id = ? '
    value.push(gedung_id)
  }
        if (rusun_id) {
    a += ' and r.rusun_id = ? '
    value.push(rusun_id)
  }
 let body_sql = `FROM
    (
        SELECT
             t.tahun  AS tahun,
             CASE t.bulan 
                WHEN 1 THEN 'Januari'
                WHEN 2 THEN 'Februari'
                WHEN 3 THEN 'Maret'
                WHEN 4 THEN 'April'
                WHEN 5 THEN 'Mei'
                WHEN 6 THEN 'Juni'
                WHEN 7 THEN 'Juli'
                WHEN 8 THEN 'Agustus'
                WHEN 9 THEN 'September'
                WHEN 10 THEN 'Oktober'
                WHEN 11 THEN 'November'
                WHEN 12 THEN 'Desember'
                      END AS bulan_text, t.bulan,
             t.target_tagihan ,g.nama_gedung ,r.nama_rusun
        FROM
            target_tagihan t left join kamar_penghuni kp on kp.kamar_penghuni_id = t.kamar_penghuni_id and kp.deletedAt IS NULL
            left join kamar k  on k.kamar_id = kp.kamar_id and k.deletedAt IS NULL
            left join lantai l on k.lantai_id = l.lantai_id and l.deletedAt IS NULL
            left join gedung g on g.gedung_id  = l.gedung_id and g.deletedAt IS NULL
            left join rusun r on g.rusun_id   = r.rusun_id and r.deletedAt IS NULL
            where t.deletedAt is null ${a} 
    ) AS data_tagihan  `
    try {
       let data = await sql_enak.raw(`SELECT
    tahun,
    bulan_text , bulan,nama_gedung,nama_rusun,
    SUM(target_tagihan) AS total_target 
        ${body_sql}
GROUP BY
    tahun,
    bulan
ORDER BY
    tahun,
    bulan;`,value)
    let data2 =await sql_enak.raw(`SELECT
    nama_gedung,nama_rusun,
    SUM(target_tagihan) AS total_target   ${body_sql} `,value)
    
          res.status(200).json({ status: 200, message: "sukses", data: data[0],total:data2[0]})
    } catch (error) {
       console.log(error);
      res.status(500).json({ status: 500, message: "gagal", data: error})
    }
})
module.exports = router;
