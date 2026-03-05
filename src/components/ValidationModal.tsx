import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Box,
    IconButton,
    Grid,
    Button,
    CircularProgress,
    Paper,
    Stack,
    Fade,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import { VerificationActionsDialog, ValidationItemResult } from "./VerificationActionsDialog";

interface IndexedImage {
    name: string;
    path: string;
    phash: string;
    sha256: string;
    width: number;
    height: number;
}

interface ComparisonResult {
    score: number;
    status: string;
    matched_file: string;
}

interface ValidationModalProps {
    open: boolean;
    onClose: () => void;
    referenceUrl: string;
    storagePath: string;
}

export function ValidationModal({ open, onClose, referenceUrl, storagePath }: ValidationModalProps) {
    const [images, setImages] = useState<IndexedImage[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [result, setResult] = useState<ComparisonResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState<string>("waiting");
    const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
    const [verificationOpen, setVerificationOpen] = useState(false);

    // Load indexed images when modal opens
    useEffect(() => {
        if (open && storagePath) {
            const loadImages = async () => {
                try {
                    const indexed = await invoke<IndexedImage[]>("get_index_images", { storagePath });
                    setImages(indexed);
                    setCurrentIndex(0);
                } catch (err) {
                    console.error("Failed to load indexed images:", err);
                }
            };
            loadImages();
        }
    }, [open, storagePath]);

    // Listen for validation stages
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen<string>("validation-stage", (event) => {
                setStage(event.payload);
            });
        };

        setupListener();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    const compareImage = useCallback(async (index: number) => {
        if (!images[index] || !referenceUrl) return;

        setLoading(true);
        setResult(null);
        try {
            const res = await invoke<ComparisonResult>("compare_single_image", {
                referenceUrl,
                indexedImage: images[index],
                threshold: 85.0
            });
            setResult(res);
        } catch (err) {
            console.error("Comparison failed:", err);
        } finally {
            setLoading(false);
        }
    }, [images, referenceUrl]);

    // Compare whenever index changes
    useEffect(() => {
        if (images.length > 0 && open) {
            compareImage(currentIndex);
        }
    }, [currentIndex, images, open, compareImage]);

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    const currentImage = images[currentIndex];

    const verificationItem: ValidationItemResult | null = result && currentImage
        ? {
            url: referenceUrl,
            status: result.status,
            score: result.score,
            matched_file: currentImage.path.startsWith(storagePath)
                ? currentImage.path.slice(storagePath.length).replace(/^[/\\]+/, "")
                : currentImage.name,
            width: currentImage.width,
            height: currentImage.height,
            dpi_x: null,
            dpi_y: null,
            dpi_ok: undefined,
            measure_ok: null,
        }
        : null;

    // Load image as base64 whenever currentImage changes
    useEffect(() => {
        if (!currentImage) {
            setImageDataUrl(null);
            return;
        }
        invoke<string>("read_image_as_base64", { path: currentImage.path })
            .then(setImageDataUrl)
            .catch((err) => {
                console.error("Failed to load image:", err);
                setImageDataUrl(null);
            });
    }, [currentImage]);

    const getStatusColor = (score: number) => {
        if (score >= 85) return "#16A34A";
        if (score >= 80) return "#D97706";
        return "#DC2626";
    };

    const getStageLabel = (s: string) => {
        switch (s) {
            case "downloading": return "Baixando referência...";
            case "hashing": return "Gerando hashes...";
            case "matching": return "Comparando...";
            case "scoring": return "Calculando score...";
            case "done": return "Concluído";
            default: return "Iniciando...";
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle component="div" sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 800 }}>Validação Visual Assistida</Typography>
                <IconButton onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Grid container spacing={4}>
                    {/* Left Column: Reference */}
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, textAlign: "center" }}>
                            Imagem de Referência
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1, height: 400, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#f8fafc", overflow: "hidden" }}>
                            <Box
                                component="img"
                                src={referenceUrl}
                                sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                                alt="Referência"
                            />
                        </Paper>
                    </Grid>

                    {/* Right Column: Storage Carousel */}
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, textAlign: "center" }}>
                            Imagem do Storage
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1, height: 400, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#f8fafc", position: "relative", overflow: "hidden" }}>
                            {currentImage ? (
                                <Box
                                    component="img"
                                    src={imageDataUrl ?? undefined}
                                    sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                                    alt={currentImage.name}
                                />
                            ) : (
                                <Typography color="text.secondary">Nenhuma imagem carregada</Typography>
                            )}

                            {loading && (
                                <Box sx={{ position: "absolute", inset: 0, bgcolor: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                                    <CircularProgress size={40} sx={{ mb: 2 }} />
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{getStageLabel(stage)}</Typography>
                                </Box>
                            )}
                        </Paper>

                        {/* Score and Status */}
                        <Box sx={{ mt: 3, textAlign: "center", minHeight: 100 }}>
                            {result && !loading && (
                                <Fade in={!!result}>
                                    <Box>
                                        <Typography
                                            variant="h3"
                                            sx={{ fontWeight: 900, color: getStatusColor(result.score) }}
                                        >
                                            {result.score.toFixed(1)}%
                                        </Typography>
                                        <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mt: 1 }}>
                                            {result.status === "approved" ? (
                                                <CheckCircleIcon sx={{ color: "#16A34A" }} />
                                            ) : result.score >= 80 ? (
                                                <InfoIcon sx={{ color: "#D97706" }} />
                                            ) : (
                                                <ErrorIcon sx={{ color: "#DC2626" }} />
                                            )}
                                            <Typography
                                                variant="h6"
                                                sx={{ fontWeight: 700, textTransform: "uppercase", color: getStatusColor(result.score) }}
                                            >
                                                {result.status === "approved" ? "Aprovado" : result.score >= 80 ? "Atenção" : "Divergente"}
                                            </Typography>
                                        </Stack>
                                        {result.matched_file && (
                                            <Button
                                                variant="contained"
                                                onClick={() => setVerificationOpen(true)}
                                                sx={{ mt: 2, borderRadius: "8px", bgcolor: "#1e293b", "&:hover": { bgcolor: "#334155" } }}
                                            >
                                                Verificações
                                            </Button>
                                        )}
                                    </Box>
                                </Fade>
                            )}
                        </Box>
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions sx={{ p: 3, justifyContent: "center", gap: 2 }}>
                <Button
                    variant="outlined"
                    startIcon={<NavigateBeforeIcon />}
                    onClick={handlePrev}
                    disabled={images.length <= 1 || loading}
                    sx={{ borderRadius: "8px", px: 4 }}
                >
                    Anterior
                </Button>
                <Typography sx={{ fontWeight: 600, color: "text.secondary" }}>
                    {images.length > 0 ? `${currentIndex + 1} de ${images.length}` : "0 de 0"}
                </Typography>
                <Button
                    variant="outlined"
                    endIcon={<NavigateNextIcon />}
                    onClick={handleNext}
                    disabled={images.length <= 1 || loading}
                    sx={{ borderRadius: "8px", px: 4 }}
                >
                    Próxima
                </Button>
            </DialogActions>

            {verificationOpen && verificationItem && (
                <VerificationActionsDialog
                    open={true}
                    onClose={() => setVerificationOpen(false)}
                    item={verificationItem}
                    itemIndex={0}
                    storagePath={storagePath}
                />
            )}
        </Dialog>
    );
}
