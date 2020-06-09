const hash = require('object-hash');

async function sendToDB(entities, db) {
    console.log('Sending persons...');
    let persons = await sendCollectionToDB(entities.persons.items, db.get('persons_ocds', { castIds: false }));

    console.log('Sending societies...');
    let societies = await sendCollectionToDB(entities.companies.items, db.get('organizations_ocds', { castIds: false }));

    console.log('Sending institutions...');
    let institutions = await sendCollectionToDB(entities.institutions.items, db.get('organizations_ocds', { castIds: false }));

    console.log('Sending states/municipalities...');
    let states = await sendCollectionToDB(entities.states.items, db.get('areas_ocds', { castIds: false }));

    console.log('Sending memberships...');
    let memberships = await sendCollectionToDB(entities.memberships.items, db.get('memberships_ocds', { castIds: false }));

    return [persons, societies, institutions, states, memberships];
}

async function sendCollectionToDB(collection, dbCollection) {
    if(collection.length == 0) {
        return new Promise( function(resolve, reject) {
            resolve( { nInserted:0 } );
        } );
    }

    const operations = [];
    var datetime = new Date();

    collection.map( (doc) => {
        let id = hash(doc);
        Object.assign(doc, {'_id': id, 'date': datetime.toISOString()});
        operations.push( { insertOne: { document: doc } } );
    } );

    return dbCollection.bulkWrite(operations, { ordered:true }, function(err, r) {
        if(err) console.log('ERROR', err);
    } );
}

module.exports = sendToDB;
