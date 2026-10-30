"use client";

interface StarReactionConfirmationProps {
  open: boolean;
  cost: number;
  onConfirm: () => void;
  onCancel: () => void;
  onInsufficientStars?: () => void;
}

export function StarReactionConfirmation({ open, cost, onConfirm, onCancel }: StarReactionConfirmationProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold mb-2">Поставить ⭐ за {cost} звёзд</h3>
        <p className="text-gray-600 mb-4">Вы потратите {cost} звёзд с вашего баланса. Реакция будет добавлена к сообщению.</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          >
            Отправить ⭐
          </button>
        </div>
      </div>
    </div>
  );
}
