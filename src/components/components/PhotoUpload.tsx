import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface PhotoUploadProps {
  visitId?: string;
  onUpload?: () => void;
}

export default function PhotoUpload({ visitId, onUpload }: PhotoUploadProps) {
  const [status, setStatus] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !visitId) {
      setStatus('Escolha um arquivo e crie a visita antes de fazer o upload.');
      return;
    }

    setUploading(true);
    setStatus('Enviando arquivo...');

    const filePath = `${visitId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from('visita-fotos')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (error) {
      setStatus(`Falha ao enviar foto: ${error.message}`);
    } else {
      const { data } = supabase.storage.from('visita-fotos').getPublicUrl(filePath);
      setStatus(`Upload concluído. URL pública disponível em: ${data.publicUrl}`);
      onUpload?.();
    }

    setUploading(false);
  };

  return (
    <div className="page-card">
      <h3 className="page-title">Upload de Foto</h3>
      <p className="page-description">Envie fotos diretamente para o bucket <strong>visita-fotos</strong>.</p>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      <div className="notice">{uploading ? 'Processando upload...' : status}</div>
    </div>
  );
}
