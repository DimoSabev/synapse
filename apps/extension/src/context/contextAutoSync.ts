
import {
  startContextObserver,
  type ContextChangeEvent,
} from './contextObserver'

import {
  DOCUMENT_BINDING_KEY,
  readDocumentBinding,
} from './tabContextBinding'

import type {
  ContextBinding,
} from './contextBinding'

import { supabase } from '@/lib/supabase'
import { ingestAutomaticDocumentChange } from '@/memory/automaticDocumentChanges'

import {
  ingestBrowserMemory,
} from '@/memory/browserMemoryIngestion'

export type BoundContextChangeEvent =
  ContextChangeEvent & {
    projectId: string
    userId: string
    capturedAt: string
  }

export function initializeContextAutoSync(): () => void {
  const origin = window.location.origin

  let stopObserver: (() => void) | null = null
  let activeBinding: ContextBinding | null = null
  let disposed = false
  let revision = 0

  function stopCurrentObserver() {
    const stop = stopObserver

    stopObserver = null
    activeBinding = null

    stop?.()
  }

  function sameBinding(
    a: ContextBinding | null,
    b: ContextBinding | null
  ): boolean {
    return !!a && !!b &&
      a.enabled === b.enabled &&
      a.captureContent === b.captureContent &&
      a.projectId === b.projectId &&
      a.userId === b.userId &&
      a.allowedOrigins.length ===
        b.allowedOrigins.length &&
      a.allowedOrigins.every(
        (value, index) =>
          value === b.allowedOrigins[index]
      )
  }

  function handleChange(event: ContextChangeEvent) {
    const binding = activeBinding

    if (
      disposed ||
      !stopObserver ||
      !binding?.enabled ||
      !binding.allowedOrigins.includes(origin)
    ) {
      return
    }

    const structuredEvent: BoundContextChangeEvent = {
      ...event,
      projectId: binding.projectId,
      userId: binding.userId,
      capturedAt: new Date().toISOString(),
    }

    const authorized = () =>
      !disposed &&
      stopObserver !== null &&
      activeBinding === binding &&
      binding.enabled &&
      binding.allowedOrigins.includes(origin)

    console.log(
      '[Synapse] Authorized browser change:',
      {
        projectId: binding.projectId,
        changeType: event.change.type,
        origin,
      }
    )

    void ingestBrowserMemory(
      structuredEvent,
      authorized
    )

    if (binding.captureContent === true) {
      void ingestAutomaticDocumentChange(structuredEvent, authorized)
    }
  }

  async function updateObserver(
    forceRevalidate = false
  ) {
    const currentRevision = ++revision

    try {
      const binding = await readDocumentBinding()

      if (disposed || currentRevision !== revision) {
        return
      }

      if (
        !binding?.enabled ||
        !binding.allowedOrigins.includes(origin)
      ) {
        stopCurrentObserver()
        return
      }

      if (
        !forceRevalidate &&
        stopObserver &&
        sameBinding(activeBinding, binding)
      ) {
        return
      }

      stopCurrentObserver()

      const { data, error } =
        await supabase.auth.getUser()

      if (disposed || currentRevision !== revision) {
        return
      }

      if (
        error ||
        !data.user ||
        data.user.id !== binding.userId
      ) {
        console.warn(
          '[Synapse] Browser sync blocked: user mismatch'
        )
        return
      }

      const {
        data: membership,
        error: membershipError,
      } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', binding.projectId)
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (disposed || currentRevision !== revision) {
        return
      }

      if (membershipError || !membership) {
        console.warn(
          '[Synapse] Browser sync blocked: membership'
        )
        return
      }

      const latest = await readDocumentBinding()

      if (disposed || currentRevision !== revision) {
        return
      }

      if (!sameBinding(binding, latest)) {
        void updateObserver()
        return
      }

      activeBinding = binding

      stopObserver = startContextObserver(
        handleChange,
        () =>
          !disposed &&
          activeBinding === binding &&
          binding.enabled
      )

      console.log(
        '[Synapse] Document context bound:',
        {
          projectId: binding.projectId,
          origin,
        }
      )
    } catch (error) {
      if (disposed || currentRevision !== revision) {
        return
      }

      stopCurrentObserver()

      console.error(
        '[Synapse] Context initialization failed:',
        error
      )
    }
  }

  function onStorageChanged(
    changes: Record<
      string,
      chrome.storage.StorageChange
    >,
    areaName: string
  ) {
    if (
      areaName !== 'local' ||
      !(DOCUMENT_BINDING_KEY in changes)
    ) {
      return
    }

    // Immediately revoke the previous observer.
    stopCurrentObserver()
    void updateObserver()
  }

  const { data: authListener } =
    supabase.auth.onAuthStateChange(() => {
      queueMicrotask(() => {
        if (disposed) return

        stopCurrentObserver()
        void updateObserver(true)
      })
    })

  chrome.storage.onChanged.addListener(
    onStorageChanged
  )

  void updateObserver()

  return () => {
    disposed = true
    revision++

    chrome.storage.onChanged.removeListener(
      onStorageChanged
    )

    authListener.subscription.unsubscribe()

    stopCurrentObserver()
  }
}
