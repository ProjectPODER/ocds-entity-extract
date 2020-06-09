#!/usr/bin/env node
let hrstart = process.hrtime();
let hrend = 0;

const extractEntities = require('./lib/extract');
const sendToDB = require('./lib/insert');
const monk = require('monk');
const commandLineArgs = require('command-line-args');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'host', alias: 'h', type: String },
    { name: 'port', alias: 'p', type: String },
    { name: 'test', alias: 't', type: String }
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection) {
    console.log('ERROR: no database or collection specified.');
    process.exit(1);
}

let query = null;
if(args.test) {
    query = { 'compiledRelease.parties.contactPoint.id': {$in: ["manuel-basilio-orozco-ruiz"] } }
    // query = { 'compiledRelease.parties.id':'subdireccion-de-recursos-materiales-secretaria-de-salud' }
}
else {
    query = {}
}

// Connect to MongoDB
const url = 'mongodb://' + (args.host ? args.host : 'localhost') + ':' + (args.port ? args.port : '27017') + '/' + args.database;
const db = monk(url);

let entities = {
    companies: {
        items: [],
        index: []
    },
    institutions: {
        items: [],
        index: []
    },
    states: {
        items: [],
        index: []
    },
    persons: {
        items: [],
        index: []
    },
    memberships: {
        items: [],
        index: []
    }
}

db.then( (db) => {
    console.log('Connected to ' + args.database + '...');
    const records = db.get(args.collection);
    let processed = 0;
    records.find(query)
        .each( (record, {close, pause, resume}) => {
            let c_release = record.compiledRelease;
            let releases = record.releases;
            processed++;
            console.log(processed, c_release.ocid)
            extractEntities(c_release, releases, entities);
            release = null;
        } )
        .then( () => {
            if(args.test) {
                console.log(JSON.stringify(entities, null, 4));
                process.exit();
            }
            console.log('Extraction complete! Sending to DB...');
            sendToDB(entities, db)
            .then( ( results ) => {
                db.close();
                hrend = process.hrtime(hrstart);
                console.log('-------------------------------');
                console.log('Persons found: ' + entities.persons.items.length);
                console.log('Inserted ' + results[0].nInserted + ' persons.')
                console.log('-------------------------------');
                console.log('Companies found: ' + entities.companies.items.length);
                console.log('Inserted ' + results[1].nInserted + ' companies.')
                console.log('-------------------------------');
                console.log('Institutions found: ' + entities.institutions.items.length);
                console.log('Inserted ' + results[2].nInserted + ' institutions.')
                console.log('-------------------------------');
                console.log('States/Municipalities found: ' + entities.states.items.length);
                console.log('Inserted ' + results[3].nInserted + ' states/municipalities.')
                console.log('-------------------------------');
                console.log('Memberships found: ' + entities.memberships.items.length);
                console.log('Inserted ' + results[4].nInserted + ' memberships.')
                console.log('-------------------------------');
                console.log('Processed records: ' + processed);
                console.log('Duration: ' + hrend[0] + '.' + hrend[1] + 's');

                // Cleanup...
                entities = null;
                process.exit();
            } );
        } )
} )
.catch( (err) => { console.log(err); } );
