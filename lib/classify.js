const fs = require('fs');
const parse = require('csv-parse/lib/sync');

function buildClassifierList(paths) {
    if(paths.length > 0) {
        let lines = [];
        paths.map( (path) => {
            chainCSV(lines, path);
        } );

        return linesToObj(lines);
    }
    return null;
}

function linesToObj(lines) {
    let obj = {}
    lines.map( (line) => {
        let corrected = line[0].replace(/\s+/g, ' ');
        obj[corrected] = line[1];
    } );

    return obj;
}

function chainCSV(acc, file) {
    let rawdata = fs.readFileSync(file);
    let lines = parse(rawdata, {
      skip_empty_lines: true,
      relax_column_count: true
    });

    acc.push(...lines);
}

module.exports = buildClassifierList;
