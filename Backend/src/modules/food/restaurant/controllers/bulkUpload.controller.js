import { sendResponse, sendError } from '../../../../utils/response.js';
import { generateBulkMenuTemplate, processBulkMenuUpload } from '../services/bulkUpload.service.js';

export const downloadBulkMenuTemplateController = async (req, res, next) => {
    try {
        const workbook = await generateBulkMenuTemplate();
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=Bulk_Menu_Template.xlsx');
        res.setHeader('Content-Length', buffer.length);
        return res.status(200).end(Buffer.from(buffer));
    } catch (error) {
        next(error);
    }
};

export const uploadBulkMenuController = async (req, res, next) => {
    try {
        if (!req.file) {
            return sendError(res, 400, 'Please upload an Excel file (.xlsx)');
        }
        if (!/\.xlsx$/i.test(req.file.originalname || '')) {
            return sendError(res, 400, 'Unsupported file type. Please upload the .xlsx template file.');
        }

        const restaurantId = req.user?.userId;
        const results = await processBulkMenuUpload(restaurantId, req.file.buffer);

        return sendResponse(res, 200, 'Bulk upload completed', results);
    } catch (error) {
        next(error);
    }
};
