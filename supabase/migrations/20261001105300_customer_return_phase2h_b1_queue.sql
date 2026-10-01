-- 1. Create Trigger Function
CREATE OR REPLACE FUNCTION public.trg_customer_return_intake_completed()
RETURNS trigger AS $$
DECLARE
    v_order_id UUID;
BEGIN
    -- Only act when status transitions to completed
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN
        
        -- Get authoritative order_id
        SELECT order_id INTO v_order_id
        FROM public.customer_return_tasks
        WHERE id = NEW.customer_return_task_id;

        IF v_order_id IS NOT NULL THEN
            -- Insert into order_unpack_queue idempotently
            INSERT INTO public.order_unpack_queue (
                order_id,
                warehouse_id,
                status,
                source_type,
                source_reference_id
            ) VALUES (
                v_order_id,
                NEW.warehouse_id,
                'pending',
                'customer_return',
                NEW.customer_return_task_id
            )
            ON CONFLICT (source_type, source_reference_id) DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create Trigger
DROP TRIGGER IF EXISTS trg_customer_return_intake_completed_trigger ON public.customer_return_intakes;
CREATE TRIGGER trg_customer_return_intake_completed_trigger
    AFTER INSERT OR UPDATE OF status
    ON public.customer_return_intakes
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_customer_return_intake_completed();

-- 3. Idempotent Backfill
-- Safe because it uses ON CONFLICT DO NOTHING based on the (source_type, source_reference_id) unique constraint
INSERT INTO public.order_unpack_queue (
    order_id,
    warehouse_id,
    status,
    source_type,
    source_reference_id
)
SELECT 
    crt.order_id,
    cri.warehouse_id,
    'pending',
    'customer_return',
    cri.customer_return_task_id
FROM public.customer_return_intakes cri
JOIN public.customer_return_tasks crt ON cri.customer_return_task_id = crt.id
WHERE cri.status = 'completed'
ON CONFLICT (source_type, source_reference_id) DO NOTHING;
