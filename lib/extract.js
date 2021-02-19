const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');
const laundry = require('company-laundry');

function extractEntities(compiledRelease, releases, entities, classifierList) {
    if(compiledRelease.hasOwnProperty('parties')) {
        let parties = compiledRelease.parties;
        parties.map( (party) => {
            let metadata = { source: getPartySources(party, releases) };
            switch(party.details.type) {
                case 'institution':
                    handleInstitution(compiledRelease, party, entities, metadata);
                    break;
                default:
                    let isCompany = null;
                    // Use classifierList first if available...
                    if(classifierList) {
                        isCompany = getEntityClassifier(party.name, classifierList);
                    }

                    // If there is no classifierList or it didn't find the object...
                    if(isCompany == null) {
                        isCompany = laundry.isCompany(party.name);
                    }

                    if(isCompany) handleCompany(compiledRelease, party, entities, metadata);
                    else handlePerson(compiledRelease, party, entities, metadata);
                    break;
            }
        } );
    }
}

function getEntityClassifier(name, classifierList) {
    if(classifierList.hasOwnProperty(name)) {
        if(classifierList[name] == 'company') return true;
        else return false;
    }
    return null;
}

function handlePerson(compiledRelease, party, entities, metadata) {
    let person = null;
    let personID = party.id;
    let persIndex = findObjectInCollection(personID, entities.persons);

    if(!persIndex) {
        person = createPerson(party, metadata, 'proveedor');
        entities.persons[personID] = person;
    }
    else {
        otherNames(entities.persons[personID], party.name);
        otherIdentifiers(entities.persons[personID], party);
        otherTypes(entities.persons[personID], 'proveedor');
        mergeMetadata(entities.persons[personID], metadata);
    }

    let contract_summary = getSupplierContractSummary(personID, compiledRelease);
    entities.persons[personID].contract_count.supplier += contract_summary[0];
    entities.persons[personID].contract_amount.supplier += parseFloat(contract_summary[1]);
}

function handleCompany(compiledRelease, party, entities, metadata) {
    let company = null;
    let companyID = party.id;
    let compIndex = findObjectInCollection(companyID, entities.companies);
    let s_instIndex = findObjectInCollection(companyID, entities.institutions);

    if(!compIndex && !s_instIndex) {
        company = createCompany(party, metadata);
        entities.companies[companyID] = company;
        compIndex = true;
    }
    else if(s_instIndex) {
        otherIdentifiers(entities.institutions[companyID], party);
        otherNames(entities.institutions[companyID], party.name);
        mergeMetadata(entities.institutions[companyID], metadata);
    }
    else {
        otherIdentifiers(entities.companies[companyID], party);
        otherNames(entities.companies[companyID], party.name);
        mergeMetadata(entities.companies[companyID], metadata);
    }

    let contract_summary = getSupplierContractSummary(companyID, compiledRelease);
    let collection = null;
    if(compIndex) {
        collection = entities.companies;
    }
    else if(s_instIndex) {
        collection = entities.institutions;
    }
    collection[companyID].contract_count.supplier += contract_summary[0];
    collection[companyID].contract_amount.supplier += parseFloat(contract_summary[1]);
}

function handleInstitution(compiledRelease, party, entities, metadata) {
    let institution = null;
    let institutionID = party.id;
    let instIndex = findObjectInCollection(institutionID, entities.institutions);
    if(!instIndex) {
        institution = createInstitution(party, metadata);
        entities.institutions[institutionID] = institution;
    }
    else {
        institution = entities.institutions[institutionID];
        otherNames(institution, party.name);
        mergeMetadata(institution, metadata);
    }

    let parent = null;
    let parentID = null;
    let membership = null;
    let parentIndex = null;
    if(party.hasOwnProperty('memberOf')) {
        parentID = party.memberOf[0].id;
        parentIndex = findObjectInCollection(parentID, entities.institutions);

        if(!parentIndex) {
            let parent_party = {
                id: party.memberOf[0].id,
                name: party.memberOf[0].name,
                govLevel: party.details.govLevel,
                address: party.address
            }
            parent = createInstitution(parent_party, metadata);
            entities.institutions[parentID] = parent;
        }
        else {
            parent = entities.institutions[parentID];
            otherNames(parent, party.memberOf[0].name);
            mergeMetadata(parent, metadata);
        }

        let membershipID = institutionID + '_' + parentID;
        let memberIndex = findObjectInCollection(membershipID, entities.memberships);

        if(!memberIndex) {
            membership = createOrgMembership(membershipID, entities.institutions[institutionID], entities.institutions[parentID], metadata);
            entities.memberships[membershipID] = membership;
        }
    }

    let encargadoUC = null;
    let encargadoID = null;
    let encargadoIndex = null;
    // Agregar el encargado de la UC...
    if(party.hasOwnProperty('contactPoint')) {
        encargadoID = party.contactPoint.id;
        encargadoIndex = findObjectInCollection(encargadoID, entities.persons);
        if(!encargadoIndex) {
            encargadoUC = createPerson( { id: encargadoID, name: party.contactPoint.name }, metadata, 'funcionario' );
            entities.persons[encargadoID] = encargadoUC;
        }
        else {
            otherTypes(entities.persons[encargadoID], 'funcionario');
        }

        // Membership del encargado a la UC
        let encargadoMemberID = encargadoID + '_' + institutionID;
        let encargadoMemberIndex = findObjectInCollection(encargadoMemberID, entities.memberships);
        if(!encargadoMemberIndex) {
            let encargadoMember = createPersonMembership(encargadoMemberID, entities.persons[encargadoID], entities.institutions[institutionID], metadata);
            entities.memberships[encargadoMemberID] = encargadoMember;
        }
    }

    let country = null;
    let countryID = null;
    let countryIndex = null;
    let countryCode = null;

    let state = null;
    let stateID = null;
    let stateIndex = null;

    let municipality = null;
    let municipalityID = null;
    let municipalityIndex = null;

    let municipalityStateMembership = null;
    let municipalityStateMembershipID = null;

    let stateCountryMembership = null;
    let stateCountryMembershipID = null;

    // Agregar estado y municipalidad si aplica
    let govLevel = null;
    if(party.hasOwnProperty('govLevel')) govLevel = party.govLevel;
    else if( party.hasOwnProperty('details') && party.details.hasOwnProperty('govLevel') ) govLevel = party.details.govLevel;
    if(govLevel != null) {
        countryCode = laundry.cleanCountry(party.address.countryName);
        countryID = laundry.simpleName(countryCode);
        // Crear el país
        countryIndex = findObjectInCollection(countryID, entities.states);
        if(!countryIndex) {
            // Crear el estado
            country = createCountry(countryID, countryCode, metadata);
            entities.states[countryID] = country;
        }
        else {
            country = entities.states[countryID];
        }

        switch(govLevel) {
            case 'city':
                // Crear el estado
                stateID = getStateID(party.address, countryCode);
                stateIndex = findObjectInCollection(stateID, entities.states);
                if(!stateIndex) {
                    // Crear el estado
                    state = createState('state', stateID, party.address.region, country, metadata);
                    entities.states[stateID] = state;

                    // Crear membership de estado a país
                    stateCountryMembershipID = countryID + '_' + stateID;
                    stateCountryMembership = createCountryMembership(stateCountryMembershipID, country, state, metadata);
                    entities.memberships[stateCountryMembershipID] = stateCountryMembership;
                }
                else {
                    state = entities.states[stateID];
                }

                // Crear la municipalidad
                municipalityID = stateID + '-' + laundry.simpleName(laundry.launder(party.address.locality));
                municipalityIndex = findObjectInCollection(municipalityID, entities.states);
                if(!municipalityIndex) {
                    // Crear la municipalidad
                    municipality = createState('municipality', municipalityID, party.address.locality, state, metadata);
                    entities.states[municipalityID] = municipality;

                    // Crear membership de municipalidad a estado
                    municipalityStateMembershipID = municipalityID + '_' + stateID;
                    municipalityStateMembership = createStateMembership(municipalityStateMembershipID, state, municipality, metadata);
                    entities.memberships[municipalityStateMembershipID] = municipalityStateMembership;
                }
                else {
                    municipality = entities.states[municipalityID];
                }

                // Agregar membership de la institution a la municipalidad
                let orgMunicipalityMembershipID = institutionID + '_' + municipalityID;
                let orgMunicipalityMemberIndex = findObjectInCollection(orgMunicipalityMembershipID, entities.memberships);
                if(!orgMunicipalityMemberIndex) {
                    let orgMunicipalityMembership = createOrgMunicipalityMembership(orgMunicipalityMembershipID, institution, municipality, metadata);
                    entities.memberships[orgMunicipalityMembershipID] = orgMunicipalityMembership;
                }

                if(parent) {
                    // Agregar membership del parent a la municipalidad
                    let parentMunicipalityMembershipID = parentID + '_' + municipalityID;
                    let parentMunicipalityMemberIndex = findObjectInCollection(parentMunicipalityMembershipID, entities.memberships);
                    if(!parentMunicipalityMemberIndex) {
                        let parentMunicipalityMembership = createOrgMunicipalityMembership(parentMunicipalityMembershipID, parent, municipality, metadata);
                        entities.memberships[parentMunicipalityMembershipID] = parentMunicipalityMembership;
                    }
                }
                break;
            case 'region':
                stateID = getStateID(party.address, countryCode);
                stateIndex = findObjectInCollection(stateID, entities.states);
                if(!stateIndex) {
                    // Crear el estado
                    state = createState('state', stateID, party.address.region, country, metadata);
                    entities.states[stateID] = state;

                    // Crear membership de estado a país
                    stateCountryMembershipID = countryID + '_' + stateID;
                    stateCountryMembership = createCountryMembership(stateCountryMembershipID, country, state, metadata);
                    entities.memberships[stateCountryMembershipID] = stateCountryMembership;
                }
                else {
                    state = entities.states[stateID];
                }

                // Agregar membership de la institution al estado
                let orgStateMembershipID = institutionID + '_' + stateID;
                let orgStateMemberIndex = findObjectInCollection(orgStateMembershipID, entities.memberships);
                if(!orgStateMemberIndex) {
                    orgStateMembership = createOrgStateMembership(orgStateMembershipID, institution, state, metadata);
                    entities.memberships[orgStateMembershipID] = orgStateMembership;
                }

                if(parent) {
                    // Agregar membership del parent al estado
                    let parentStateMembershipID = parentID + '_' + stateID;
                    let parentStateMemberIndex = findObjectInCollection(parentStateMembershipID, entities.memberships);
                    if(!parentStateMemberIndex) {
                        let parentStateMembership = createOrgStateMembership(parentStateMembershipID, parent, state, metadata);
                        entities.memberships[parentStateMembershipID] = parentStateMembership;
                    }
                }
                break;
        }

        Object.assign(entities.institutions[institutionID], { govLevel: govLevel });
        if(parent)
            Object.assign(entities.institutions[parentID], { govLevel: govLevel });
    }

    let contract_summary = getBuyerContractSummary(institutionID, compiledRelease);

    if(party.roles[0] == 'funder') {
        entities.institutions[institutionID].contract_count.funder += contract_summary[0];
        entities.institutions[institutionID].contract_amount.funder += parseFloat(contract_summary[1]);
    }
    else {
        entities.institutions[institutionID].contract_count.buyer += contract_summary[0];
        entities.institutions[institutionID].contract_amount.buyer += parseFloat(contract_summary[1]);
    }

    if(parentID) {
        entities.institutions[parentID].contract_count.buyer += contract_summary[0];
        entities.institutions[parentID].contract_amount.buyer += parseFloat(contract_summary[1]);
    }
    if(encargadoID) {
        entities.persons[encargadoID].contract_count.buyer += contract_summary[0];
        entities.persons[encargadoID].contract_amount.buyer += parseFloat(contract_summary[1]);
    }

    // Actualizar contract_counts y amounts de país, estado y municipalidad
    if(countryID) {
        entities.states[countryID].contract_count += contract_summary[0];
        entities.states[countryID].contract_amount += parseFloat(contract_summary[1]);
    }
    if(stateID) {
        entities.states[stateID].contract_count += contract_summary[0];
        entities.states[stateID].contract_amount += parseFloat(contract_summary[1]);
    }
    if(municipalityID) {
        entities.states[municipalityID].contract_count += contract_summary[0];
        entities.states[municipalityID].contract_amount += parseFloat(contract_summary[1]);
    }
}

function otherNames(entity, new_name) {
    if(entity.name != new_name) {
        let othernames = entity.other_names.filter( othername => othername.name == new_name );
        if(othernames.length == 0) {
            entity.other_names.push( { name: new_name } );
        }
    }
}

function otherIdentifiers(entity, party) {
    let ids = [];
    if(party.hasOwnProperty('identifier')) {
        ids.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        party.additionalIdentifiers.map( id => ids.push(id) );
    }

    ids.map( (id) => {
        let found = entity.identifiers.filter( (e_id) => (e_id.id == id.id) && (e_id.scheme == id.scheme) );
        if(found.length == 0) entity.identifiers.push(id);
    } );
}

function otherTypes(entity, new_type) {
    if(entity.classification.length > 0) {
        let types = entity.classification.filter( type => type == new_type );
        if(types.length == 0) {
            entity.classification.push( new_type );
        }
    }
    else {
        entity.classification = [new_type];
    }
}

function getPartySources(party, releases) {
    let sources = [];

    releases.map( (release) => {
        release.parties.map( (r_party) => {
            if(r_party.id == party.id) {
                release.source.map( (source) => {
                    let found = false;
                    sources.map((s) => {
                        if(s.id == source.id) found = true
                    });
                    if(!found) {
                        sources.push(source);
                    }
                } );
            }
        } );
    } );

    return sources;
}

function mergeMetadata(item, metadata) {
    metadata.source.map( (source) => {
        let found = false;
        item.source.map( (itemSource) => {
            if(itemSource.id == source.id) {
                found = true;
            }
        } );
        if(!found) {
            item.source.push({ id: source.id });
        }
    } );
}

function createCompany(party, metadata) {
    let org = {
        id: party.id,
        name: party.name,
        other_names: [],
        classification: 'company',
        contract_count: {
            buyer: 0,
            supplier: 0
        },
        contract_amount: {
            buyer: 0,
            supplier: 0
        }
    };

    let type = laundry.companyType(party.name);
    if(type != '') {
        Object.assign(org, {
            subclassification: type
        });
    }

    let identifiers = [];
    if(party.hasOwnProperty('identifier')) {
        identifiers.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        identifiers.push(...party.additionalIdentifiers);
    }
    Object.assign(org, {
        identifiers: identifiers
    });

    let country = 'MX';
    let country_name = "México";
    if(party.hasOwnProperty('address') && party.address.hasOwnProperty('countryName')) {
        country = laundry.cleanCountry(party.address.countryName);
        country_name = party.address.countryName;
    }
    let area = [{
        id: laundry.simpleName(country),
        name: country_name,
        classification: 'country'
    }];
    Object.assign(org, { area: area });

    if(metadata) {
        Object.assign(org, metadata);
    }

    return org;
}

function createCountry(id, name, metadata) {
    let country = {
        id: id,
        name: name,
        classification: 'country',
        contract_count: 0,
        contract_amount: 0
    };

    if(metadata) {
        Object.assign(country, metadata);
    }

    return country;
}

function createState(type, id, name, parent = null, metadata) {
    let state = {
        id: id,
        name: name,
        classification: type,
        contract_count: 0,
        contract_amount: 0
    };

    if(parent)  Object.assign(state, { parent_id: parent.id, parent_name: parent.name });
    else           Object.assign(state, { parent_id: 'mx', parent_name: 'México' });

    if(metadata) {
        Object.assign(state, metadata);
    }

    return state;
}

function createInstitution(party, metadata) {
    let org = {
        id: party.id,
        name: party.name,
        other_names: [],
        classification: 'institution',
        contract_count: {
            buyer: 0,
            supplier: 0,
            funder: 0
        },
        contract_amount: {
            buyer: 0,
            supplier: 0,
            funder: 0
        }
    };

    let subclass = '';
    if(party.hasOwnProperty('roles') && party.roles[0] == 'funder') {
        subclass = 'banco';
    }
    else if(party.hasOwnProperty('details') && party.details.hasOwnProperty('classification')) {
        subclass = party.details.classification;
    }
    else if(party.hasOwnProperty('memberOf')) {
        Object.assign(org, { parent_id: party.memberOf[0].id });
        subclass = 'unidad-compradora';
    }
    else {
        subclass = 'dependencia';
    }
    Object.assign(org, { subclassification: subclass });

    let identifiers = [];
    if(party.hasOwnProperty('identifier')) {
        identifiers.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        identifiers.push(...party.additionalIdentifiers);
    }
    Object.assign(org, {
        identifiers: identifiers
    });

    if(party.hasOwnProperty('contactPoint')) {
        Object.assign(org, { contact_details: [ { type: 'contactPoint', value: party.contactPoint.name } ] });
    }

    let govLevel = null;
    if(party.hasOwnProperty('govLevel')) govLevel = party.govLevel;
    else if( party.hasOwnProperty('details') && party.details.hasOwnProperty('govLevel') ) govLevel = party.details.govLevel;
    if(govLevel != null) {
        let area = [];
        let countryCode = laundry.cleanCountry(party.address.countryName);
        let regionID = getStateID(party.address, countryCode);

        if(party.address.hasOwnProperty('region'))
        switch(govLevel) {
            case 'city':
                let cityObj = {
                    id: regionID + '-' + laundry.simpleName(laundry.launder(party.address.locality)),
                    name: party.address.locality,
                    classification: 'city',
                    parent_id: regionID,
                    parent: party.address.region
                };
                area.push(cityObj);
            case 'region':
                let stateObj = {
                    id: regionID,
                    name: party.address.region,
                    classification: 'region',
                    parent_id: laundry.simpleName(countryCode),
                    parent: countryCode
                };
                area.push(stateObj);
            case 'country':
                let countryObj = {
                    id: laundry.simpleName(countryCode),
                    name: countryCode,
                    classification: 'country'
                };
                area.push(countryObj);
                break;
        }

        Object.assign(org, { area: area, govLevel: govLevel });
    }

    if(metadata) {
        Object.assign(org, metadata);
    }

    return org;
}

function getStateID(address, country) {
    let id = '';
    if(address.hasOwnProperty('region')) {
        if(country == 'MX') {
            switch(address.region) { // returns ISO-3166-2:MX codes
                case 'Aguascalientes': id = 'agu';
                    break;
                case 'Baja California': id = 'bcn';
                    break;
                case 'Baja California Sur': id = 'bcs';
                    break;
                case 'Campeche': id = 'cam';
                    break;
                case 'Chiapas': id = 'chp';
                    break;
                case 'Chihuahua': id = 'chh';
                    break;
                case 'Ciudad de México':
                case 'Ciudad de Mexico':
                    id = 'cmx';
                    break;
                case 'Coahuila':
                case 'Coahuila de Zaragoza':
                    id = 'coa';
                    break;
                case 'Colima': id = 'col';
                    break;
                case 'Durango': id = 'dur';
                    break;
                case 'Guerrero': id = 'gro';
                    break;
                case 'Guanajuato': id = 'gua';
                    break;
                case 'Hidalgo': id = 'hid';
                    break;
                case 'Jalisco': id = 'jal';
                    break;
                case 'Mexico':
                case 'México':
                    id = 'mex';
                    break;
                case 'Michoacan de Ocampo':
                case 'Michoacán de Ocampo':
                case 'Michoacán':
                case 'Michoacan':
                    id = 'mic';
                    break;
                case 'Morelos': id = 'mor';
                    break;
                case 'Nayarit': id = 'nay';
                    break;
                case 'Nuevo León':
                case 'Nuevo Leon':
                    id = 'nle';
                    break;
                case 'Oaxaca': id = 'oax';
                    break;
                case 'Puebla': id = 'pue';
                    break;
                case 'Querétaro': id = 'que';
                    break;
                case 'Quintana Roo': id = 'roo';
                    break;
                case 'San Luis Potosi':
                case 'San Luis Potosí':
                    id = 'slp';
                    break;
                case 'Sinaloa': id = 'sin';
                    break;
                case 'Sonora': id = 'son';
                    break;
                case 'Tabasco': id = 'tab';
                    break;
                case 'Tamaulipas': id = 'tam';
                    break;
                case 'Tlaxcala': id = 'tla';
                    break;
                case 'Veracruz':
                case 'Veracruz de Ignacio de la Llave':
                    id = 'ver';
                    break;
                case 'Yucatan':
                case 'Yucatán':
                    id = 'yuc';
                    break;
                case 'Zacatecas': id = 'zac';
                    break;
            }
        }
        else {
            id = laundry.simpleName(address.region);
        }

        id = laundry.simpleName(country) + '-' + id;
    }
    return id;
}

function createCountryMembership(id, country, state, metadata) {
    let membership = {
        id: id,
        role: "Estado",
        organization_id: state.id,
        organization_name: state.name,
        organization_class: 'state',
        parent_id: country.id,
        parent_name: country.name,
        parent_class: 'country'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createStateMembership(id, state, municipality, metadata) {
    let membership = {
        id: id,
        role: "Municipio",
        organization_id: municipality.id,
        organization_name: municipality.name,
        organization_class: 'municipality',
        parent_id: state.id,
        parent_name: state.name,
        parent_class: 'state'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createOrgStateMembership(id, org, state, metadata) {
    let membership = {
        id: id,
        role: "Pertenece a Estado",
        organization_id: org.id,
        organization_name: org.name,
        organization_class: org.classification,
        organization_subclass: org.subclassification,
        parent_id: state.id,
        parent_name: state.name,
        parent_class: 'state'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createOrgMunicipalityMembership(id, org, municipality, metadata) {
    let membership = {
        id: id,
        role: "Pertenece a Municipio",
        organization_id: org.id,
        organization_name: org.name,
        organization_class: org.classification,
        organization_subclass: org.subclassification,
        parent_id: municipality.id,
        parent_name: municipality.name,
        parent_class: 'municipality'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createOrgMembership(id, child, parent, metadata) {
    let membership = {
        id: id,
        role: 'Unidad Compradora',
        organization_id: child.id,
        organization_name: child.name,
        organization_class: child.classification,
        organization_subclass: child.subclassification,
        parent_id: parent.id,
        parent_name: parent.name,
        parent_class: parent.classification,
        parent_subclass: parent.subclassification
    };

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createPersonMembership(id, child, parent, metadata) {
    let membership = {
        id: id,
        role: 'Punto de Contacto',
        person_id: child.id,
        person_name: child.name,
        parent_id: parent.id,
        parent_name: parent.name,
        parent_class: parent.classification,
        parent_subclass: parent.subclassification
    };

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createPerson(party, metadata, type='') {
    let person = {
        id: party.id,
        name: party.name,
        other_names: [],
        contract_count: {
            buyer: 0,
            supplier: 0
        },
        contract_amount: {
            buyer: 0,
            supplier: 0
        }
    };

    if(type != '') {
        Object.assign(person, {
            classification: [type]
        });
    }

    let identifiers = [];
    if(party.hasOwnProperty('identifier')) {
        identifiers.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        identifiers.push(...party.additionalIdentifiers);
    }
    Object.assign(person, {
        identifiers: identifiers
    });

    let country = 'MX';
    let country_name = "México";
    if(party.hasOwnProperty('address') && party.address.hasOwnProperty('countryName')) {
        country = laundry.cleanCountry(party.address.countryName);
        country_name = party.address.countryName;
    }
    let area = [{
        id: laundry.simpleName(country),
        name: country_name,
        classification: 'country'
    }];
    Object.assign(person, { area: area });

    if(metadata) {
        Object.assign(person, metadata);
    }

    return person;
}

function getSupplierContractSummary(id, compiledRelease) {
    let count = 0;
    let amount = 0;

    if(compiledRelease.hasOwnProperty('awards')) {
        compiledRelease.awards.map( (award) => {
            if(award.suppliers[0].id == id) {
                count++;
                amount += award.value.amount
            }
        } );
    }

    return [ count, amount ];
}

function getBuyerContractSummary(id, compiledRelease) {
    let count = 0;
    let amount = 0;

    if(compiledRelease.hasOwnProperty('contracts')) {
        compiledRelease.contracts.map( (contract) => {
            count++;
            amount += contract.value.amount
        } );
    }

    return [ count, amount ];
}

function findObjectInCollection(id, collection) {
    return collection.hasOwnProperty(id);
}

module.exports = extractEntities;
