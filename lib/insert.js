const hash = require('object-hash');

async function sendToDB(entities, db) {
    console.log('Sending persons...');
    let persons = await sendCollectionToDB(entities.persons, db.get('persons_ocds', { castIds: false }));

    console.log('Sending societies...');
    let societies = await sendCollectionToDB(entities.companies, db.get('organizations_ocds', { castIds: false }));

    console.log('Sending institutions...');
    let institutions = await sendCollectionToDB(entities.institutions, db.get('organizations_ocds', { castIds: false }));

    console.log('Sending states/municipalities...');
    let states = await sendCollectionToDB(entities.states, db.get('areas_ocds', { castIds: false }));

    console.log('Sending memberships...');
    let memberships = await sendCollectionToDB(entities.memberships, db.get('memberships_ocds', { castIds: false }));

    console.log('Sending products...');
    let products = await sendCollectionToDB(entities.products, db.get('products_ocds', { castIds: false }));

    return [persons, societies, institutions, states, memberships, products];
}

async function sendCollectionToDB(collection, dbCollection) {
    if(Object.keys(collection).length == 0) {
        return new Promise( function(resolve, reject) {
            resolve( { nInserted:0 } );
        } );
    }

    const operations = [];
    var datetime = new Date();

    Object.keys(collection).map( (key) => {
        let doc = collection[key];
        let id = hash(doc);
        Object.assign(doc, {'_id': id, 'date': datetime.toISOString()});
        operations.push( { insertOne: { document: doc } } );
    } );

    return dbCollection.bulkWrite(operations, { ordered:true }, function(err, r) {
        if(err) console.log('ERROR', err);
    } );
}

module.exports = sendToDB;
