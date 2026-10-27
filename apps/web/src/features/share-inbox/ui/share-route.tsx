import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";

import { openShareFromToken } from "../model/share-store";

/** Маршрут /share/:token одноразовый: открыть окно и сразу вернуться к чатам (app.js). */
export function ShareRoute() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    void openShareFromToken(token);
    void navigate("/", { replace: true });
  }, [token, navigate]);
  return null;
}
