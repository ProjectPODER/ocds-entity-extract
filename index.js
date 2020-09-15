#!/usr/bin/env node
let hrstart = process.hrtime();
let hrend = 0;

const extractEntities = require('./lib/extract');
const sendToDB = require('./lib/insert');
const streamOut = require('./lib/stream');
const buildClassifierList = require('./lib/classify');
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const _ = require('lodash');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'host', alias: 'h', type: String, defaultValue: 'localhost' },
    { name: 'port', alias: 'p', type: String, defaultValue: '27017' },
    { name: 'output', alias: 'o', type: String, defaultValue: 'stream' },
    { name: 'classifiers', alias: 'x', type: String, multiple: true },
    { name: 'test', alias: 't', type: Boolean }
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection) {
    console.log('ERROR: no database or collection specified.');
    process.exit(1);
}
if(args.output != 'db' && args.output != 'stream') {
    console.log('ERROR: unsupported output value ' + args.output);
    console.log('Supported values are: \n* db\n* stream');
    process.exit(1);
}

let classifierList = null;
if(args.classifiers) {
    classifierList = buildClassifierList(args.classifiers);
}

let query = null;
if(args.test) {
    query = {};
    console.log("Testing",query);
    // query = { 'compiledRelease.parties.contactPoint.id': {$in: ["manuel-basilio-orozco-ruiz"] } };
    // query = { 'compiledRelease.parties.id':'subdireccion-de-recursos-materiales-secretaria-de-salud' }
}
else {
    query = {}
}

// Connect to MongoDB
const url = 'mongodb://' + args.host + ':' + args.port + '/' + args.database;
const db = monk(url);

let entities = {
    companies: {},
    institutions: {},
    states: {},
    persons: {},
    memberships: {}
}

db.then( (db) => {
    if(args.output == 'db') console.log('Connected to ' + args.database + '...');
    const records = db.get(args.collection);
    let processed = 0;
    records.find(query)
        .each( (record, {close, pause, resume}) => {
            let c_release = record.compiledRelease;
            let releases = record.releases;
            processed++;

            if(args.output == 'db') console.log(processed, c_release.ocid)
            extractEntities(c_release, releases, entities, classifierList);

            // Cleanup...
            delete releases;
            delete c_release;
            delete record;
        } )
        .then( () => {
            if(args.test) {
                console.log('Testing complete.');
                process.exit(1);
            }
            else if(args.output == 'db') {
                console.log('Extraction complete! Sending to DB...');
                sendToDB(entities, db)
                .then( ( results ) => {
                    db.close();
                    hrend = process.hrtime(hrstart);
                    console.log('-------------------------------');
                    console.log('Persons found: ' + Object.keys(entities.persons).length);
                    console.log('Inserted ' + results[0].nInserted + ' persons.')
                    console.log('-------------------------------');
                    console.log('Companies found: ' + Object.keys(entities.companies).length);
                    console.log('Inserted ' + results[1].nInserted + ' companies.')
                    console.log('-------------------------------');
                    console.log('Institutions found: ' + Object.keys(entities.institutions).length);
                    console.log('Inserted ' + results[2].nInserted + ' institutions.')
                    console.log('-------------------------------');
                    console.log('States/Municipalities found: ' + Object.keys(entities.states).length);
                    console.log('Inserted ' + results[3].nInserted + ' states/municipalities.')
                    console.log('-------------------------------');
                    console.log('Memberships found: ' + Object.keys(entities.memberships).length);
                    console.log('Inserted ' + results[4].nInserted + ' memberships.')
                    console.log('-------------------------------');
                    console.log('Processed records: ' + processed);
                    console.log('Duration: ' + hrend[0] + '.' + hrend[1] + 's');

                    // Cleanup...
                    entities = null;
                    process.exit();
                } );
            }
            else if(args.output == 'stream') {
                streamOut(entities);
            }
        } )
} )
.catch( (err) => { console.log(err); } );
