"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const MODEL_STORAGE_KEY = "localgpt:selected-model";
const DEFAULT_MODEL = "";

export function useModel(defaultModel = DEFAULT_MODEL) {
  const [model, setModelState] = useState(defaultModel);
  const modelRef = useRef(model);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      let saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved === "phi4:14b") {
        saved = null;
        window.localStorage.removeItem(MODEL_STORAGE_KEY);
      }
      if (saved) {
        setModelState(saved);
        modelRef.current = saved;
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const setModel = useCallback((nextModel: string) => {
    setModelState(nextModel);
    modelRef.current = nextModel;
    if (nextModel) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel);
    } else {
      window.localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  }, []);

  return { model, setModel, modelRef };
}
