import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { copyToClipboard, COPY_TOAST_DURATION } from './clipboard'
import { TOAST_DURATION_SUCCESS } from './constants'

describe('clipboard', () => {
  // Store original implementations
  const originalClipboard = navigator.clipboard
  const originalExecCommand = document.execCommand

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original implementations
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    })
    document.execCommand = originalExecCommand
  })

  describe('COPY_TOAST_DURATION', () => {
    it('should equal TOAST_DURATION_SUCCESS', () => {
      expect(COPY_TOAST_DURATION).toBe(TOAST_DURATION_SUCCESS)
    })

    it('should be 2000ms', () => {
      expect(COPY_TOAST_DURATION).toBe(2000)
    })
  })

  describe('copyToClipboard', () => {
    describe('modern clipboard API path', () => {
      it('should return true on successful clipboard write', async () => {
        const mockWriteText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: mockWriteText },
          writable: true,
          configurable: true,
        })

        const result = await copyToClipboard('test text')

        expect(result).toBe(true)
        expect(mockWriteText).toHaveBeenCalledWith('test text')
        expect(mockWriteText).toHaveBeenCalledTimes(1)
      })

      it('should pass the exact text to clipboard API', async () => {
        const mockWriteText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: mockWriteText },
          writable: true,
          configurable: true,
        })

        const complexText = 'Line1\nLine2\tTabbed\n特殊字符'
        await copyToClipboard(complexText)

        expect(mockWriteText).toHaveBeenCalledWith(complexText)
      })

      it('should handle empty string', async () => {
        const mockWriteText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: mockWriteText },
          writable: true,
          configurable: true,
        })

        const result = await copyToClipboard('')

        expect(result).toBe(true)
        expect(mockWriteText).toHaveBeenCalledWith('')
      })
    })

    describe('fallback path', () => {
      let mockTextarea: {
        value: string
        style: { position: string; opacity: string }
        select: ReturnType<typeof vi.fn>
      }
      let appendChildSpy: ReturnType<typeof vi.spyOn>
      let removeChildSpy: ReturnType<typeof vi.spyOn>
      let createElementSpy: ReturnType<typeof vi.spyOn>
      let mockExecCommand: ReturnType<typeof vi.fn>

      beforeEach(() => {
        // Make clipboard API throw to trigger fallback
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: vi.fn().mockRejectedValue(new Error('Clipboard API not available')),
          },
          writable: true,
          configurable: true,
        })

        // Create mock textarea
        mockTextarea = {
          value: '',
          style: { position: '', opacity: '' },
          select: vi.fn(),
        }

        // Spy on document methods
        createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockTextarea as unknown as HTMLElement)
        appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
        removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

        // Mock execCommand
        mockExecCommand = vi.fn().mockReturnValue(true)
        document.execCommand = mockExecCommand
      })

      afterEach(() => {
        createElementSpy.mockRestore()
        appendChildSpy.mockRestore()
        removeChildSpy.mockRestore()
      })

      it('should fall back when clipboard API throws', async () => {
        const result = await copyToClipboard('fallback text')

        expect(result).toBe(true)
        expect(createElementSpy).toHaveBeenCalledWith('textarea')
      })

      it('should create textarea with correct value', async () => {
        await copyToClipboard('test content')

        expect(mockTextarea.value).toBe('test content')
      })

      it('should set position: fixed on textarea', async () => {
        await copyToClipboard('test')

        expect(mockTextarea.style.position).toBe('fixed')
      })

      it('should set opacity: 0 on textarea', async () => {
        await copyToClipboard('test')

        expect(mockTextarea.style.opacity).toBe('0')
      })

      it('should append textarea to document body', async () => {
        await copyToClipboard('test')

        expect(appendChildSpy).toHaveBeenCalledWith(mockTextarea)
      })

      it('should select textarea content', async () => {
        await copyToClipboard('test')

        expect(mockTextarea.select).toHaveBeenCalled()
      })

      it('should call execCommand with copy', async () => {
        await copyToClipboard('test')

        expect(mockExecCommand).toHaveBeenCalledWith('copy')
      })

      it('should remove textarea from document body', async () => {
        await copyToClipboard('test')

        expect(removeChildSpy).toHaveBeenCalledWith(mockTextarea)
      })

      it('should execute fallback steps in correct order', async () => {
        const callOrder: string[] = []

        createElementSpy.mockImplementation(() => {
          callOrder.push('createElement')
          return mockTextarea as unknown as HTMLElement
        })

        appendChildSpy.mockImplementation((node) => {
          callOrder.push('appendChild')
          return node
        })

        mockTextarea.select = vi.fn(() => {
          callOrder.push('select')
        })

        mockExecCommand.mockImplementation(() => {
          callOrder.push('execCommand')
          return true
        })

        removeChildSpy.mockImplementation((node) => {
          callOrder.push('removeChild')
          return node
        })

        await copyToClipboard('test')

        expect(callOrder).toEqual([
          'createElement',
          'appendChild',
          'select',
          'execCommand',
          'removeChild',
        ])
      })

      it('should handle special characters in fallback path', async () => {
        const specialText = '<script>alert("xss")</script>\n\t日本語'
        await copyToClipboard(specialText)

        expect(mockTextarea.value).toBe(specialText)
      })
    })
  })
})
