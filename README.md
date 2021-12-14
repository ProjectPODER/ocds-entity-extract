# OCDS Entity Extract

This script analyzes OCDS record documents inside a Mongo collection and extracts entity information in Popolo format (persons, organizations, memberships, areas). Additionally, if present, the script can also extract products from purchases.

## Usage

    node index.js -d DATABASE -c COLLECTION

## Options

    --database      -d  Name of the Mongo database.
    --collection    -c  Name of the Mongo collection with OCDS records.
    --host          -h  Mongo host (for authentication, host is "user@pass:hostname"). Defaults to localhost.
    --port          -p  Mongo port (defaults to 27017).
    -- output       -o  Output type (stream | db).
    --classifiers   -x  List of paths to CSV files with preclassified entity types.
    --test          -t  Test the script.

## Output

Depending on the specified output type, the script can stream out all JSON objects, one object per line, or insert the documents into the same Mongo database using new collections.

When streaming the output, documents are grouped by entity type and streamed in the following order: persons, companies, institutions, states, memberships, products.

When inserting into Mongo, collection names are: persons, organizations, areas, memberships, products.

### Object structure

Entities are generated according to the Popolo standard except areas and products. In addition to extracted information, all documents also contain special summary objects that contain contract counts and amounts for each entity, as well as purchase counts and amounts when contracts contain itemized purchases. Summaries are separated according to the entity's role, enabling the summarization of contract counts and amounts for entities that act as both buyer and supplier in different contracts.

## Classifier lists

Using the option **-x --classifiers** it is possible to specify a preclassification for certain named entities into persons and companies, instead of relying on the automatic classification provided by the script.

Files referenced by this option should be in CSV format and contain the following structure:

    0: Entity name (string)
    1: Classification (string: "person" or "company")

## Testing

When using the -t argument to test the script, output is verbose and no information is inserted into Mongo when database output is selected.
