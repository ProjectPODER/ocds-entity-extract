const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');
const laundry = require('company-laundry');

function extractEntities(compiledRelease, releases, entities) {
    if(compiledRelease.hasOwnProperty('parties')) {
        let parties = compiledRelease.parties;
        parties.map( (party) => {
            let metadata = { source: getPartySources(party, releases) };
            switch(party.details.type) {
                case 'society':
                case 'company':
                    handleCompany(compiledRelease, party, entities, metadata);
                    break;
                case 'institution':
                    handleInstitution(compiledRelease, party, entities, metadata);
                    break;
                case 'person':
                    handlePerson(compiledRelease, party, entities, metadata);
                    break;
            }
        } );
    }
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

    let state = null;
    let stateID = null;
    let stateIndex = null;
    let municipality = null;
    let municipalityID = null;
    let municipalityIndex = null;
    let municipalityStateMembership = null;
    let municipalityStateMembershipID = null;

    // Agregar estado y municipalidad si aplica
    let govLevel = null;
    if(party.hasOwnProperty('govLevel')) govLevel = party.govLevel;
    else if( party.hasOwnProperty('details') && party.details.hasOwnProperty('govLevel') ) govLevel = party.details.govLevel;
    if(govLevel != null) {
        switch(govLevel) {
            case 'city':
                // Crear el estado
                stateID = laundry.simpleName(laundry.launder(party.address.region));
                stateIndex = findObjectInCollection(stateID, entities.states);
                if(!stateIndex) {
                    // Crear el estado
                    state = createState(stateID, party.address);
                    entities.states[stateID] = state;
                }
                else {
                    state = entities.states[stateID];
                }

                // Crear la municipalidad
                municipalityID = laundry.simpleName(laundry.launder(party.address.locality + ' ' + party.address.region));
                municipalityIndex = findObjectInCollection(municipalityID, entities.states);
                if(!municipalityIndex) {
                    // Crear la municipalidad
                    municipality = createState(municipalityID, party.address.locality, stateID);
                    entities.states[municipalityID] = municipality;

                    // Crear membership de municipalidad a estado
                    municipalityStateMembershipID = municipalityID + '_' + stateID;
                    municipalityStateMembership = createStateMembership(municipalityStateMembershipID, state, municipality);
                    entities.memberships[municipalityStateMembershipID] = municipalityStateMembership;
                }
                else {
                    municipality = entities.states[municipalityID];
                }

                // Agregar membership de la institution a la municipalidad
                let orgMunicipalityMembershipID = institutionID + '_' + municipalityID;
                let orgMunicipalityMemberIndex = findObjectInCollection(orgMunicipalityMembershipID, entities.memberships);
                if(!orgMunicipalityMemberIndex) {
                    let orgMunicipalityMembership = createOrgMunicipalityMembership(orgMunicipalityMembershipID, institution, municipality);
                    entities.memberships[orgMunicipalityMembershipID] = orgMunicipalityMembership;
                }

                if(parent) {
                    // Agregar membership del parent a la municipalidad
                    let parentMunicipalityMembershipID = parentID + '_' + municipalityID;
                    let parentMunicipalityMemberIndex = findObjectInCollection(parentMunicipalityMembershipID, entities.memberships);
                    if(!parentMunicipalityMemberIndex) {
                        let parentMunicipalityMembership = createOrgMunicipalityMembership(parentMunicipalityMembershipID, parent, municipality);
                        entities.memberships[parentMunicipalityMembershipID] = parentMunicipalityMembership;
                    }
                }
                break;
            case 'region':
                stateID = laundry.simpleName(laundry.launder(party.address.region));
                stateIndex = findObjectInCollection(stateID, entities.states);
                if(!stateIndex) {
                    // Crear el estado
                    state = createState(stateID, party.address.region);
                    entities.states[stateID] = state;
                }
                else {
                    state = entities.states[stateID];
                }

                // Agregar membership de la institution al estado
                let orgStateMembershipID = institutionID + '_' + stateID;
                let orgStateMemberIndex = findObjectInCollection(orgStateMembershipID, entities.memberships);
                if(!orgStateMemberIndex) {
                    orgStateMembership = createOrgStateMembership(orgStateMembershipID, institution, state);
                    entities.memberships[orgStateMembershipID] = orgStateMembership;
                }

                if(parent) {
                    // Agregar membership del parent al estado
                    let parentStateMembershipID = parentID + '_' + stateID;
                    let parentStateMemberIndex = findObjectInCollection(parentStateMembershipID, entities.memberships);
                    if(!parentStateMemberIndex) {
                        let parentStateMembership = createOrgStateMembership(parentStateMembershipID, parent, state);
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

    // Actualizar contract_counts y amounts de estado y municipalidad
    if(stateID) {
        entities.states[stateID].contract_count.buyer += contract_summary[0];
        entities.states[stateID].contract_amount.buyer += parseFloat(contract_summary[1]);
    }
    if(municipalityID) {
        entities.states[municipalityID].contract_count.buyer += contract_summary[0];
        entities.states[municipalityID].contract_amount.buyer += parseFloat(contract_summary[1]);
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
    if(party.hasOwnProperty('address')) {
        country = party.address.countryName;
    }
    let area = [{
        id: laundry.simpleName(laundry.launder(country)),
        name: country,
        classification: 'country',
        parent_id: '',
        parent: ''
    }];
    Object.assign(org, { area: area });

    if(metadata) {
        Object.assign(org, metadata);
    }

    return org;
}

function createState(id, name, parent_id = null) {
    let state = {
        id: id,
        name: name,
        classification: (parent_id)? 'municipality' : 'state',
        contract_count: 0,
        contract_amount: 0
    };

    if(parent_id) {
        Object.assign(state, { parent_id: parent_id });
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
        switch(govLevel) {
            case 'city':
                let cityObj = {
                    id: laundry.simpleName(laundry.launder(party.address.locality + ' ' + party.address.region)),
                    name: party.address.locality,
                    classification: 'city',
                    parent_id: laundry.simpleName(laundry.launder(party.address.region)),
                    parent: party.address.region
                };
                area.push(cityObj);
            case 'region':
                let stateObj = {
                    id: laundry.simpleName(laundry.launder(party.address.region)),
                    name: party.address.region,
                    classification: 'region',
                    parent_id: laundry.simpleName(laundry.launder(party.address.countryName)),
                    parent: party.address.countryName
                };
                area.push(stateObj);
            case 'country':
                let countryObj = {
                    id: laundry.simpleName(countryCode),
                    name: countryCode,
                    classification: 'country',
                    parent_id: '',
                    parent: ''
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

function createStateMembership(id, state, municipality) {
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

    return membership;
}

function createOrgStateMembership(id, org, state) {
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

    return membership;
}

function createOrgMunicipalityMembership(id, org, municipality) {
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
    if(party.hasOwnProperty('address')) {
        country = laundry.cleanCountry(party.address.countryName);
    }
    let area = [{
        id: laundry.simpleName(country),
        name: country,
        classification: 'country',
        parent_id: '',
        parent: ''
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
