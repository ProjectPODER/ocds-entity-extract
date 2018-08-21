#!/usr/bin/env node
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const extractEntities = require('./lib/extract');
const { upsertPersonas,
        upsertEmpresas,
        upsertEntidades } = require('./lib/upsert');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'year', alias: 'y', type: String }
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection) {
    console.log('ERROR: no database or collection specified.');
    process.exit(1);
}
if(!args.year) {
    console.log('ERROR: you must specify a year.');
    process.exit(1);
}

var processedContracts = 0,
    promisesReturned = 0;
// const query = {'contracts.period.startDate': {$gt: args.year + '-01-01T00:00:000Z', $lt: args.year + '-12-31T23:59:599Z'}};
const query = {'contracts.period.startDate': {$gt: new Date(args.year + '-01-01T00:00:00.000Z'), $lt: new Date(args.year + '-12-31T23:59:59.000Z')}}

// Connection URL
const url = 'mongodb://localhost:27017/' + args.database;
const db = monk(url)
            .then( (db) => {
                console.log('Connected to ' + args.database + '...');
                const contracts = db.get(args.collection, { castIds: false });
                contracts.count(query, function(error, count) {
                    processedContracts = count;
                    contracts.find(query)
                        .each( (contract, {close, pause, resume}) => {
                            // 0: personas
                            // 1: empresas
                            // 2: entidades
                            var entities = extractEntities(contract);

                            let upsertPromises = [];

                            if(entities[0].length > 0) {
                                upsertPromises.push(upsertPersonas(entities[0], db));
                                pause();
                            }
                            if(entities[1].length > 0) {
                                upsertPromises.push(upsertEmpresas(entities[1], db));
                                pause();
                            }
                            if(entities[2].length > 0) {
                                upsertPromises.push(upsertEntidades(entities[2], db));
                                pause();
                            }

                            Promise.all(upsertPromises).then((results) => {
                                resume();
                                promisesReturned++;
                                if(promisesReturned == processedContracts) {
                                    console.log('------------------------------');
                                    console.log('Processed ' + processedContracts + ' contracts.');
                                    console.log('------------------------------');
                                    console.log('Disconnecting...');
                                    db.close();
                                    console.log('Connection closed.');
                                    process.exit(0);
                                }
                            }).catch(e => { throw e });
                        } )
                        .then( () => {
                            console.log('Processed: ' + processedContracts);
                        } );
                });
            } )
            .catch( (err) => { console.log('Error connecting to ' + args.database, err) } );
