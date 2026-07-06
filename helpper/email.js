const nodemailer = require('nodemailer')
var connection = require('../database').connection;
var sql_enak = require('../database/mysql_enak.js').connection;

const ejs = require('ejs');
const path = require('path');
const email = function (email, subject, isi) { 
    console.log(email, subject, isi);
    var transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
         user: 'dsr010192@gmail.com',
         pass: 'utxobdjezzlrzeln'
        }
        });
    var mainOptions = {
        from: 'Service Desk BRI Insurance',
        to:email,
        subject: subject,
        html: isi
    };
let a =''
    transporter.sendMail(mainOptions, function (err, info) {
        if (err) {
            console.log(err);
            a = err
        } else {
            console.log('Message sent: ' + info.response + ' else');
            a = 'Message sent: ' + info.response
        }
    });
    console.log(a);
    return a

}
module.exports = {
    email
}
