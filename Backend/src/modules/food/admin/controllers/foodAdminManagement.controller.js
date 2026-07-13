import { asyncHandler } from '../../../../utils/asyncHandler.js';
import * as foodAdminManagementService from '../services/foodAdminManagementService.js';

export const getFoodAdminPermissions = asyncHandler(async (_req, res) => {
  const permissions = await foodAdminManagementService.listFoodAdminPermissions();
  res.json({ success: true, data: permissions });
});

export const getAssignableFoodZones = asyncHandler(async (req, res) => {
  const zones = await foodAdminManagementService.listAssignableFoodZones(req.adminContext || req.user);
  res.json({ success: true, data: { zones } });
});

export const getFoodAdmins = asyncHandler(async (req, res) => {
  const admins = await foodAdminManagementService.listFoodAdmins(req.adminContext || req.user);
  res.json({ success: true, data: { results: admins } });
});

export const getFoodAdminById = asyncHandler(async (req, res) => {
  const admin = await foodAdminManagementService.getFoodAdminById(
    req.adminContext || req.user,
    req.params.id,
  );
  res.json({ success: true, data: admin });
});

export const createFoodAdminAccount = asyncHandler(async (req, res) => {
  const admin = await foodAdminManagementService.createFoodAdminAccount(
    req.adminContext || req.user,
    req.body,
  );
  res.status(201).json({ success: true, data: admin });
});

export const updateFoodAdminAccount = asyncHandler(async (req, res) => {
  const admin = await foodAdminManagementService.updateFoodAdminAccount(
    req.adminContext || req.user,
    req.params.id,
    req.body,
  );
  res.json({ success: true, data: admin });
});

export const deleteFoodAdminAccount = asyncHandler(async (req, res) => {
  const result = await foodAdminManagementService.deleteFoodAdminAccount(
    req.adminContext || req.user,
    req.params.id,
  );
  res.json({ success: true, data: result });
});
