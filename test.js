const Random = require('meteor-random');
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const { upsertPersonas,
        upsertEmpresas,
        upsertEntidades } = require('./lib/upsert');

const insertTest = {
                      _id: Random.id(),
                      address: { country: 'Mexico' },
                      immediate_parent: 'banco nacional de comercio exterior snc',
                      name: 'Subdirección de Adquisiciones de Bienes Muebles y Servicios',
                      names: 'Subdirección de Adquisiciones de Bienes Muebles y Servicios',
                      parent: 'banco nacional de comercio exterior snc',
                      public: { government: 'APF' },
                      simple: 'subdireccion de adquisiciones de bienes muebles y servicios',
                      source: 'OCDS',
                      created_at: '2018-07-19T21:11:09.381Z',
                      ocds_contract_count: 1 };

const updateTest = { '$set':
                       { address: { country: 'Mexico' },
                         immediate_parent: 'centro de investigacion en alimentacion y desarrollo ac',
                         name: 'Centro de Investigación en Alimentación y Desarrollo, A.C.',
                         names: 'Centro de Investigación en Alimentación y Desarrollo, A.C.',
                         parent: 'centro de investigacion en alimentacion y desarrollo ac',
                         public: { government: 'APF' },
                         simple: 'centro de investigacion en alimentacion y desarrollo ac',
                         source: 'OCDS' },
                      '$inc': { ocds_contract_count: 1 },
                      '$currentDate': { lastModified: true }
                  };

const url = 'mongodb://localhost:27017/quienesquienwiki';
const db = monk(url)
            .then( (db) => {
                console.log('Connected to quienesquienwiki...');
                console.log(insertTest._id);
                const orgs = db.get('testing', { castIds: false });

                let insertP = orgs.insert(insertTest);

                Promise.all([insertP]).then( (results) => {
                    console.log(results);
                    db.close();
                } );

                // let updateP = orgs.update({_id:'5b51017eca5aa831a6a67ed4'}, updateTest);
                //
                // Promise.all([updateP]).then( (results) => {
                //     console.log(results);
                //     db.close();
                // } );
            })
            .catch( (err) => { console.log('Error connecting to quienesquienwiki', err) } );
