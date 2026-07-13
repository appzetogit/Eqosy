import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "@food/utils/auth";
import {
  getRouteResource,
  hasFoodAdminPermission,
  isFoodSuperAdminLike,
} from "@food/constants/foodAdminAccess";

export default function FoodAdminPermissionRoute({ children, resource = null, action = "read" }) {
  const location = useLocation();
  const admin = getCurrentUser("admin") || {};
  const requiredResource = resource || getRouteResource(location.pathname);

  if (isFoodSuperAdminLike(admin)) {
    return children;
  }

  if (requiredResource && !hasFoodAdminPermission(admin, requiredResource, action)) {
    return <Navigate to="/admin/food" replace state={{ from: location.pathname }} />;
  }

  return children;
}
