const path = require("path");

const formatters = {
    formatDate: (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}${month}${day}`;
    },

    formatPatientId: (patientId) => {
        return String(patientId).padStart(8, "0");
    },

    buildFilePath: (
        patientId,
        fileName,
        baseDir = "C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients"
    ) => {
        const formattedPatientId = formatters.formatPatientId(patientId);
        const patientDir = path.join(baseDir, formattedPatientId);
        const fullPath = path.join(patientDir, fileName);

        return {
            patientDir,
            fullPath,
            baseDir: patientDir,
            pass: fullPath
        };
    },

    generateFileName: (type = "居宅療養管理指導報告書", date = new Date()) => {
        const dateStr = formatters.formatDate(date);
        return `${dateStr}${type}.pdf`;
    }
};

module.exports = formatters;