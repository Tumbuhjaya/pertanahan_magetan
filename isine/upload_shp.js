var connection = require('../database').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , session = require('express-session')
  , cookieParser = require('cookie-parser')
  , path = require('path');
var cek_login = require('./login').cek_login;
var multer = require("multer");
var sql_enak = require('../database/mysql_enak.js').connection;
const fs = require('fs');
const shapefile = require('shapefile');

// Configure multer for shapefile upload
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'shp/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname);
    var baseName = path.basename(file.originalname, ext);
    cb(null, 'datane' + ext);
  }
});

var upload = multer({ storage: storage });

router.get('/', cek_login, function(req, res) {
  res.render('upload_form_shp');
});

// Handle file upload - multiple files
var cpUpload = upload.fields([
  { name: 'shp', maxCount: 1 }, 
  { name: 'shx', maxCount: 1 }, 
  { name: 'dbf', maxCount: 1 }
]);

// Function to convert geometry to WKT
function toWKT(geometry) {
  if (!geometry) return null;
  
  try {
    const type = geometry.type;
    const coordinates = geometry.coordinates;
    
    function formatCoords(coords) {
      if (Array.isArray(coords[0])) {
        return coords.map(formatCoords).join(',');
      }
      return coords.join(' ');
    }
    
    if (type === 'Point') {
      return `POINT(${coordinates.join(' ')})`;
    } else if (type === 'LineString') {
      return `LINESTRING(${coordinates.map(c => c.join(' ')).join(',')})`;
    } else if (type === 'Polygon') {
      return `POLYGON((${coordinates[0].map(c => c.join(' ')).join(',')}))`;
    } else if (type === 'MultiPolygon') {
      const polygons = coordinates.map(poly => 
        `(${poly[0].map(c => c.join(' ')).join(',')})`
      );
      return `MULTIPOLYGON(${polygons.join(',')})`;
    }
    return null;
  } catch (error) {
    console.error('Error converting to WKT:', error);
    return null;
  }
}

// Function to map shapefile attributes to database columns
function mapAttributesToDatabase(attrs) {
  // Mapping from shapefile columns to database columns
  const mapping = {
    'NM_PNGUASA': 'nm_pnguasa',
    'ALMT_RMH': 'almt_rmh',
    'ALMT_KTP': 'almt_ktp',
    'NIK': 'nik',
    'NO_KK': 'no_kk',
    'NO_SRTFKT': 'no_srtfkt',
    'L_TANAH': 'l_tanah',
    'ZNT': 'znt',
    'NO_HAK': 'no_hak',
    'JNS_HAK': 'jns_hak',
    'NIB': 'nib',
    'TH_KPMLKN': 'th_kpmlkn',
    'BTS_BRT': 'bts_brt',
    'BTS_TMR': 'bts_tmr',
    'BTS_SLTN': 'bts_sltn',
    'BTS_UTR': 'bts_utr',
    'NOP': 'nop',
    'P_BUMI': 'p_bumi',
    'P_BNGNAN': 'p_bngnan',
    'NJOP': 'njop',
    'TAGIHAN': 'tagihan',
    'T_PMBYRAN': 't_pmbyran',
    'STTS_BAYAR': 'stts_bayar',
    'L_BNGUNAN': 'l_bangunan',
    'PMFTN_LHN': 'pmftn_lhn',
    'PRNTKN_LHN': 'prntkn_lhn',
    'ZN_RUANG': 'zn_ruang',
    'L_BUMI': 'l_bumi',
    'K_BUMI': 'k_bumi',
    'K_BANGUNAN': 'k_bangunan',
    'KD_KEC': 'kd_kec',
    'KD_KEL': 'kd_kel',
  };
  
  const result = {};
  
  // Map each attribute
  for (const [shpCol, dbCol] of Object.entries(mapping)) {
    if (attrs[shpCol] !== undefined && attrs[shpCol] !== null) {
      let value = attrs[shpCol];
      
      // Handle string values - remove quotes if present
      if (typeof value === 'string') {
        value = value.replace(/^"|"$/g, '');
        if (value === 'null' || value === 'NULL' || value === '') {
          value = null;
        }
      }
      
      // Handle numeric values
      if (value !== null && typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
        const numericCols = ['l_tanah', 'znt', 'nib', 'th_kpmlkn', 'l_bangunan', 
                           'p_bumi', 'p_bngnan', 'njop', 'tagihan', 'l_bumi', 
                           'k_bumi', 'k_bangunan', 'nik', 'no_kk', 'no_srtfkt', 
                           'no_hak', 'nop', 'bts_brt', 'bts_tmr', 'bts_sltn', 'bts_utr'];
        if (numericCols.includes(dbCol)) {
          value = parseFloat(value);
          if (isNaN(value)) value = null;
        }
      }
      
      // Handle date fields
      if (dbCol === 't_pmbyran' && value) {
        try {
          // Try to parse date
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            value = date;
          }
        } catch (e) {
          value = null;
        }
      }
      
      result[dbCol] = value;
    }
  }
  
  // Ensure kd_kec and kd_kel are properly set
  if (!result.kd_kec && attrs['KD_KEC']) {
    result.kd_kec = attrs['KD_KEC'];
  }
  if (!result.kd_kel && attrs['KD_KEL']) {
    result.kd_kel = attrs['KD_KEL'];
  }
  
  return result;
}

// Endpoint to upload and read shapefile
router.post('/shp', cpUpload, async function(req, res){
  try {
    const shpPath = path.join(__dirname, '../shp/datane.shp');
    const dbfPath = path.join(__dirname, '../shp/datane.dbf');
    
    console.log('Checking files at:', shpPath, dbfPath);
    
    // Check if files exist
    if (!fs.existsSync(shpPath)) {
      return res.status(400).json({ 
        status: 400, 
        message: "Shapefile not found at: " + shpPath
      });
    }
    
    if (!fs.existsSync(dbfPath)) {
      return res.status(400).json({ 
        status: 400, 
        message: "DBF file not found at: " + dbfPath
      });
    }
    
    // Read shapefile
    console.log('Reading shapefile...');
    const source = await shapefile.open(shpPath, dbfPath);
    const geometries = [];
    const attributes = [];
    const mappedData = [];
    
    // Read all features
    let result = await source.read();
    let counter = 0;
    
    while (!result.done) {
      const feature = result.value;
      counter++;
      
      // Get geometry as WKT
      const wkt = toWKT(feature.geometry);
      if (wkt) {
        geometries.push(wkt);
        attributes.push(feature.properties || {});
        
        // Map attributes to database columns
        const mapped = mapAttributesToDatabase(feature.properties || {});
        mappedData.push(mapped);
      }
      
      result = await source.read();
    }
    
    console.log(`Successfully read ${counter} features, ${geometries.length} with geometry`);
    
    res.json({
      status: 200,
      message: "success",
      geometry: geometries,
      attributes: attributes,
      mappedData: mappedData,
      count: geometries.length,
      sampleMapped: mappedData.length > 0 ? mappedData[0] : null,
      sampleAttributes: attributes.length > 0 ? attributes[0] : null
    });
    
  } catch (error) {
    console.error('Error reading shapefile:', error);
    res.status(500).json({ 
      status: 500, 
      message: "Failed to read shapefile", 
      error: error.message,
      stack: error.stack
    });
  }
});

// Save to database endpoint
// Save to database endpoint - VERSION WITH MORE DEBUGGING
router.post('/save_shp_data', cpUpload, async function(req, res) {
  try {
    console.log('=== START SAVE PROCESS ===');
    
    const shpPath = path.join(__dirname, '../shp/datane.shp');
    const dbfPath = path.join(__dirname, '../shp/datane.dbf');
    
    console.log('Checking files at:', shpPath);
    console.log('DBF at:', dbfPath);
    
    if (!fs.existsSync(shpPath)) {
      console.error('SHP file not found!');
      return res.status(400).json({ 
        status: 400, 
        message: "Shapefile not found at: " + shpPath
      });
    }
    
    if (!fs.existsSync(dbfPath)) {
      console.error('DBF file not found!');
      return res.status(400).json({ 
        status: 400, 
        message: "DBF file not found at: " + dbfPath
      });
    }
    
    // Get kecamatan and kelurahan from request
    const kd_kec = req.body.kd_kec || '';
    const kd_kel = req.body.kd_kel || '';
       
      // Log the import
      try {
        console.log(req.body ,'kd_kelnya');
        
        await sql_enak('log_import_shp').insert({
          kel_id: req.body.kd_kel ,
          created_at: new Date()
        });
        console.log('Import logged successfully');
      } catch (logError) {
        console.error('Error logging import:', logError);
      }    
    // Read shapefile
    console.log('Reading shapefile for save...');
    const source = await shapefile.open(shpPath, dbfPath);
    const features = [];
    let counter = 0;
    let result = await source.read();
    
    while (!result.done) {
      const feature = result.value;
      counter++;
      
      const wkt = toWKT(feature.geometry);
      
      if (wkt) {
        // Map attributes to database columns
        const mapped = mapAttributesToDatabase(feature.properties || {});
        
        // Override with selected kecamatan/kelurahan if provided
        if (kd_kec) mapped.kd_kec = kd_kec;
        if (kd_kel) mapped.kd_kel = kd_kel;
        
        // Prepare data for insertion
        // Note: SHAPE will be inserted using ST_GeomFromText via raw SQL
        const insertData = {
          ...mapped,
          created_at: new Date(),
          updated_at: new Date(),
          deleted: 0
        };
        
        features.push({
          data: insertData,
          wkt: wkt
        });
      }
      
      result = await source.read();
    }
      
    if (features.length === 0) {
      console.error('No features with valid geometry found!');
      return res.status(400).json({
        status: 400,
        message: "No valid features found in shapefile"
      });
    }
    
    // Show first record sample    
    // TEST: Try inserting first record only first
    try {      
      // Use raw SQL with ST_GeomFromText
      const testData = features[0].data;
      const testWkt = features[0].wkt;
      
      // Build insert query with ST_GeomFromText
      const columns = Object.keys(testData).join(', ');
      const placeholders = Object.keys(testData).map(() => '?').join(', ');
      
      // Add SHAPE column with ST_GeomFromText
      const insertQuery = `
        INSERT INTO persil_magetan (SHAPE, ${columns}) 
        VALUES (ST_GeomFromText(?, 4326), ${placeholders})
      `;
      
      const values = [testWkt, ...Object.values(testData)];
      
      const testResult = await sql_enak.raw(insertQuery, values);
      console.log('Test insert successful!');
      
    } catch (testError) {
      console.error('Test insert failed! Error:', testError.message);
      console.error('Test insert error details:', testError);
      
      // Check if table exists
      try {
        const tableCheck = await sql_enak.raw('SHOW TABLES LIKE "persil_magetan"');        
        if (!tableCheck[0]) {
          return res.status(400).json({
            status: 400,
            message: "Table 'persil_magetan' does not exist! Please create it first."
          });
        }
      } catch (tableError) {
        console.error('Error checking table:', tableError);
      }
      
      // If test fails, check column structure
      try {
        const columns = await sql_enak.raw('DESCRIBE persil_magetan');
      } catch (colError) {
        console.error('Error getting columns:', colError);
      }
      
      return res.status(500).json({
        status: 500,
        message: "Failed to insert test record",
        error: testError.message,
        sampleData: features[0]
      });
    }
    
    // If test passed, insert all records
    var savedCount = 0;
    var errors = [];
    var insertedIds = [];
    
    try {      
      // Insert in batches for better performance
      const batchSize = 50;
      for (let i = 0; i < features.length; i += batchSize) {
        const batch = features.slice(i, i + batchSize);
        console.log(`Inserting batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(features.length/batchSize)} (${batch.length} records)`);
        
        try {
          // Build bulk insert query with ST_GeomFromText
          let bulkQuery = 'INSERT INTO persil_magetan (SHAPE, ';
          const firstData = batch[0].data;
          const columns = Object.keys(firstData).join(', ');
          bulkQuery += columns + ') VALUES ';
          
          const bulkValues = [];
          const placeholders = [];
          
          batch.forEach((item, idx) => {
            const data = item.data;
            const wkt = item.wkt;
            
            // Each row: (ST_GeomFromText(?, 4326), ?, ?, ...)
            const rowPlaceholders = ['ST_GeomFromText(?, 4326)', ...Object.keys(data).map(() => '?')];
            placeholders.push(`(${rowPlaceholders.join(', ')})`);
            
            bulkValues.push(wkt);
            Object.values(data).forEach(val => bulkValues.push(val));
          });
          
          bulkQuery += placeholders.join(', ');
          
          console.log('Executing bulk insert...');
          const result = await sql_enak.raw(bulkQuery, bulkValues);
          savedCount += batch.length;
          console.log(`Batch inserted successfully: ${batch.length} records`);
          
        } catch (batchError) {
          console.error('Error inserting batch:', batchError);
          
          // Try inserting one by one for this batch
          for (let j = 0; j < batch.length; j++) {
            try {
              const item = batch[j];
              const data = item.data;
              const wkt = item.wkt;
              
              const columns = Object.keys(data).join(', ');
              const placeholders = Object.keys(data).map(() => '?').join(', ');
              
              const insertQuery = `
                INSERT INTO persil_magetan (SHAPE, ${columns}) 
                VALUES (ST_GeomFromText(?, 4326), ${placeholders})
              `;
              
              const values = [wkt, ...Object.values(data)];
              const result = await sql_enak.raw(insertQuery, values);
              
              savedCount++;
              insertedIds.push(result[0]);              
            } catch (singleError) {
              console.error(`Error inserting record ${i+j}:`, singleError.message);
              errors.push({
                index: i + j,
                error: singleError.message,
                data: batch[j]
              });
            }
          }
        }
      }
      
      console.log(`Total saved: ${savedCount} records`);
   
      
      res.json({
        status: 200,
        message: `Data saved: ${savedCount} records`,
        savedCount: savedCount,
        totalCount: features.length,
        insertedIds: insertedIds,
        errors: errors.length > 0 ? errors : null
      });
      
    } catch (error) {
      console.error('Error in bulk insert:', error);
      res.status(500).json({ 
        status: 500, 
        message: "Failed to save data", 
        error: error.message,
        stack: error.stack
      });
    }
    
  } catch (error) {
    console.error('Overall error in save process:', error);
    res.status(500).json({ 
      status: 500, 
      message: "Failed to save data", 
      error: error.message,
      stack: error.stack
    });
  }
});

// Get history
router.get('/history', async function(req, res) {
  try {
    // Check if table exists, if not create it
    try {
      await sql_enak.raw('SELECT 1 FROM log_import_shp LIMIT 1');
    } catch (e) {
      // Table doesn't exist, create it
      await sql_enak.raw(`
        CREATE TABLE IF NOT EXISTS log_import_shp (
          id INT AUTO_INCREMENT PRIMARY KEY,
          kel_id VARCHAR(20),
          deleted INT DEFAULT 0,
          inserted_at DATETIME
        )
      `);
    }
    
    const data = await sql_enak.raw(`select DATE_FORMAT(a.created_at ,'%d-%m-%Y') as tgl , b.namobj ,c.kecamatan  from log_import_shp a left join batas_admin_desa b on a.kel_id = b.id_desa left join batas_admin_kecamatan c on b.id_kec = c.id_kec where a.deleted = 0 `)
    
    res.json(data);
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ 
      status: 500, 
      message: "Failed to get history", 
      error: error.message 
    });
  }
});

module.exports = router;