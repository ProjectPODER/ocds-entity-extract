const hash = require('object-hash');

function streamOut(entities) {
    let delimiter = '[SPLIT]';

    let persons_str = collectionString(entities.persons);
    entities.persons = null;
    let orgs_str = collectionString(entities.companies);
    entities.companies = null;
    orgs_str += collectionString(entities.institutions);
    entities.institutions = null;
    let areas_str = collectionString(entities.states);
    entities.states = null;
    let members_str = collectionString(entities.memberships);
    entities.memberships = null;
    let products_str = collectionString(entities.products);
    entities.products = null;

    process.stdout.write( persons_str + delimiter + orgs_str + delimiter + areas_str + delimiter + members_str + delimiter + products_str, process.exit );
}

function collectionString(collection) {
    if(Object.keys(collection).length == 0) {
        return null;
    }

    const operations = [];
    let string = '';

    Object.keys(collection).map( (key) => {
        let doc = collection[key];
        let id = hash(doc);
        Object.assign(doc, { '_id': id });
        if(!doc.hasOwnProperty('date')) {
            var datetime = new Date();
            Object.assign(doc, { 'date': datetime.toISOString() });
        }
        string += JSON.stringify(doc) + '\n'
    } );

    return string;
}

module.exports = streamOut;
